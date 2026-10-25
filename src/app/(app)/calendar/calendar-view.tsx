"use client";

import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventSourceFuncArg,
  EventInput,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import {
  Ban,
  Bell,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  ExternalLink,
  Flag,
  PlayCircle,
  RefreshCw,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { LeaseStatusBadge } from "@/components/app/lease-badges";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EVENT_TYPE_LABELS, type CalendarEventType } from "@/domain/calendar/events";
import { LEASE_STATUSES, LEASE_STATUS_LABELS, type LeaseStatus } from "@/domain/leases/status";
import { formatPeso } from "@/domain/money/money";
import { addDays } from "@/domain/time/calendar-date";
import { formatIsoDate } from "@/domain/time/manila";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/server/calendar/service";

const TYPE_ICONS: Record<CalendarEventType, LucideIcon> = {
  END: Flag,
  START: PlayCircle,
  REMINDER: Bell,
  RENT_DUE: Wallet,
};
const TYPE_SHORT: Record<CalendarEventType, string> = {
  END: "Ends",
  START: "Starts",
  REMINDER: "Reminder",
  RENT_DUE: "Rent due",
};
const STATUS_ICONS: Record<LeaseStatus, LucideIcon> = {
  UPCOMING: CalendarClock,
  ACTIVE: CircleCheck,
  EXPIRING: Clock,
  EXPIRED: TriangleAlert,
  RENEWED: RefreshCw,
  TERMINATED: Ban,
};

type ViewName = "dayGridMonth" | "dayGridWeek" | "listMonth";
const VIEWS: { name: ViewName; label: string }[] = [
  { name: "dayGridMonth", label: "Month" },
  { name: "dayGridWeek", label: "Week" },
  { name: "listMonth", label: "List" },
];

export function CalendarView({
  buildings,
  unitTypes,
  staff,
  initialDate,
}: {
  buildings: { id: string; name: string }[];
  unitTypes: { id: string; name: string }[];
  staff: boolean;
  initialDate?: string;
}) {
  const calRef = useRef<FullCalendar>(null);
  const [title, setTitle] = useState("");
  const [view, setView] = useState<ViewName>("dayGridMonth");
  const [buildingId, setBuildingId] = useState("");
  const [unitTypeId, setUnitTypeId] = useState("");
  const [status, setStatus] = useState("");
  const availableTypes: CalendarEventType[] = staff
    ? ["END", "START", "REMINDER", "RENT_DUE"]
    : ["END", "START"];
  // Rent due dates are off by default to keep the calendar uncluttered.
  const [types, setTypes] = useState<CalendarEventType[]>(
    staff ? ["END", "START", "REMINDER"] : ["END", "START"],
  );
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Phones start in the list view, which is easier to read on a small screen.
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) {
      calRef.current?.getApi().changeView("listMonth");
      setView("listMonth");
    }
  }, []);

  const fetchEvents = useCallback(
    async (info: EventSourceFuncArg): Promise<EventInput[]> => {
      const from = info.startStr.slice(0, 10);
      const to = addDays(info.endStr.slice(0, 10), -1);
      const params = new URLSearchParams({ from, to, types: types.join(",") });
      if (buildingId) params.set("buildingId", buildingId);
      if (unitTypeId) params.set("unitTypeId", unitTypeId);
      if (status) params.set("status", status);
      const res = await fetch(`/api/v1/calendar?${params}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/login?reason=idle");
        return [];
      }
      if (!res.ok) {
        setError("We couldn't load the calendar. Please try again.");
        return [];
      }
      setError(null);
      const { events } = (await res.json()) as { events: CalendarEvent[] };
      return events.map((e) => ({
        id: e.id,
        title: `${TYPE_SHORT[e.type]}: ${e.tenantName} · ${e.unitLabel}`,
        start: e.date,
        allDay: true,
        classNames: ["pf-event", `pf-status-${e.status}`, `pf-type-${e.type}`],
        extendedProps: { data: e },
      }));
    },
    [types, buildingId, unitTypeId, status],
  );

  // FullCalendar re-fetches by itself when the filters (and so `fetchEvents`) change. Also
  // re-fetch when the tab regains focus, to pick up edits made elsewhere.
  useEffect(() => {
    const onFocus = () => calRef.current?.getApi().refetchEvents();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const api = () => calRef.current?.getApi();
  const toggleType = (t: CalendarEventType, on: boolean) =>
    setTypes((cur) => (on ? [...new Set([...cur, t])] : cur.filter((x) => x !== t)));

  const renderEvent = (arg: EventContentArg) => {
    const e = arg.event.extendedProps.data as CalendarEvent;
    const StatusIcon = STATUS_ICONS[e.status];
    const TypeIcon = TYPE_ICONS[e.type];
    return (
      <span
        className="flex min-w-0 items-center gap-1.5"
        title={`${LEASE_STATUS_LABELS[e.status]} · ${arg.event.title}`}
      >
        <StatusIcon className="size-3.5 shrink-0" aria-hidden />
        <TypeIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{arg.event.title}</span>
        <span className="sr-only">({LEASE_STATUS_LABELS[e.status]})</span>
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-card grid gap-4 rounded-xl border p-4 shadow-sm sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="cal-building">Building</Label>
          <NativeSelect
            id="cal-building"
            value={buildingId}
            onChange={(e) => setBuildingId(e.target.value)}
          >
            <option value="">All buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cal-type">Unit type</Label>
          <NativeSelect
            id="cal-type"
            value={unitTypeId}
            onChange={(e) => setUnitTypeId(e.target.value)}
          >
            <option value="">All unit types</option>
            {unitTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cal-status">Lease status</Label>
          <NativeSelect id="cal-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {LEASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEASE_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <fieldset className="space-y-1.5 sm:col-span-3">
          <legend className="mb-1.5 font-medium">Show</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {availableTypes.map((t) => {
              const Icon = TYPE_ICONS[t];
              return (
                <div key={t} className="flex items-center gap-2">
                  <Checkbox
                    id={`cal-show-${t}`}
                    checked={types.includes(t)}
                    onCheckedChange={(v) => toggleType(t, v === true)}
                  />
                  <Label htmlFor={`cal-show-${t}`} className="gap-1 font-normal">
                    <Icon className="text-muted-foreground size-4" aria-hidden />{" "}
                    {EVENT_TYPE_LABELS[t]}
                  </Label>
                </div>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* Simple toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => api()?.today()}>
          Today
        </Button>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous" onClick={() => api()?.prev()}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next" onClick={() => api()?.next()}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <h2 className="min-w-0 flex-1 text-xl font-semibold" aria-live="polite">
          {title}
        </h2>
        <div role="group" aria-label="View" className="bg-card flex rounded-lg border p-1">
          {VIEWS.map((v) => (
            <button
              key={v.name}
              type="button"
              aria-pressed={view === v.name}
              onClick={() => {
                api()?.changeView(v.name);
                setView(v.name);
              }}
              className={cn(
                "h-9 rounded-md px-4 font-medium",
                view === v.name
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="bg-danger-soft text-danger rounded-lg p-3">
          {error}
        </p>
      ) : null}

      <div className="pf-calendar bg-card rounded-xl border p-2 shadow-sm sm:p-4">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, listPlugin]}
          initialView="dayGridMonth"
          initialDate={initialDate}
          headerToolbar={false}
          height="auto"
          firstDay={0}
          dayMaxEvents={4}
          fixedWeekCount={false}
          events={fetchEvents}
          eventContent={renderEvent}
          eventClick={(arg: EventClickArg) =>
            setSelected(arg.event.extendedProps.data as CalendarEvent)
          }
          datesSet={(arg: DatesSetArg) => setTitle(arg.view.title)}
          noEventsContent="Nothing on these dates."
          moreLinkText={(n) => `+${n} more`}
          eventTimeFormat={{ hour: "numeric", minute: "2-digit" }}
          listDayFormat={{ weekday: "long", day: "numeric", month: "short", year: "numeric" }}
          listDaySideFormat={false}
        />
      </div>

      {/* Legend: colour is always paired with an icon and a word */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Legend">
        {(
          ["ACTIVE", "UPCOMING", "EXPIRING", "EXPIRED", "RENEWED", "TERMINATED"] as LeaseStatus[]
        ).map((s) => {
          const Icon = STATUS_ICONS[s];
          return (
            <span
              key={s}
              className={cn(
                "pf-event inline-flex items-center gap-1.5 rounded px-2 py-0.5",
                `pf-status-${s}`,
              )}
            >
              <Icon className="size-3.5" aria-hidden /> {LEASE_STATUS_LABELS[s]}
            </span>
          );
        })}
      </div>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>{selected ? <EventPanel event={selected} /> : null}</SheetContent>
      </Sheet>
    </div>
  );
}

function EventPanel({ event: e }: { event: CalendarEvent }) {
  const Icon = TYPE_ICONS[e.type];
  const what =
    e.type === "REMINDER" && e.daysBefore !== undefined
      ? `Reminder: ${e.daysBefore} days before the lease ends`
      : EVENT_TYPE_LABELS[e.type];
  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-10">{e.tenantName}</SheetTitle>
        <SheetDescription className="flex items-center gap-2">
          <Icon className="size-4" aria-hidden /> {what} · {formatIsoDate(e.date)}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-6 pb-6">
        <LeaseStatusBadge status={e.status} />
        <dl className="divide-y rounded-lg border">
          {[
            ["Unit", `${e.unitLabel}, ${e.buildingName}`],
            ["Lease", `${formatIsoDate(e.startDate)} – ${formatIsoDate(e.endDate)}`],
            ...(e.lease
              ? [
                  ["Reference", e.lease.refNo],
                  ["Monthly rent", formatPeso(e.lease.monthlyRent)],
                  ["Time left", e.lease.timeLeft],
                ]
              : []),
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-2.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {e.lease ? (
          <div className="flex flex-col gap-3">
            <Button asChild>
              <Link href={`/leases/${e.lease.id}`}>
                <ExternalLink aria-hidden /> Open lease
              </Link>
            </Button>
            {e.lease.canRenew ? (
              <Button asChild variant="outline">
                <Link href={`/leases/${e.lease.id}/renew`}>
                  <RefreshCw aria-hidden /> Renew
                </Link>
              </Button>
            ) : null}
            {(e.type === "REMINDER" || e.type === "END") &&
            e.status !== "RENEWED" &&
            e.status !== "TERMINATED" ? (
              <div>
                <Button variant="outline" className="w-full" disabled>
                  <Bell aria-hidden /> Mark reminder handled
                </Button>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  Available when reminder emails are switched on (next update).
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
