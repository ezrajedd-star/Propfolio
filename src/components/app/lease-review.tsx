import { BellRing, CalendarRange, DoorOpen, UserRound, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { describeTerms, type TermsForDescription } from "@/domain/leases/describe";
import type { ReminderConfig } from "@/domain/reminders/config";
import { describeRepeat, formatDateList, reminderSchedule } from "@/domain/reminders/schedule";
import { formatDuration, isIsoDate, type IsoDate } from "@/domain/time/calendar-date";
import { formatIsoDate } from "@/domain/time/manila";

function Row({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof DoorOpen;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4 py-4">
      <span className="bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">{title}</h3>
        <div className="mt-1 space-y-1">{children}</div>
      </div>
    </div>
  );
}

/** Plain-language summary of a lease before saving (wizard step 4, renewal). */
export function LeaseReview({
  unitLabel,
  tenantName,
  terms,
  reminderConfig,
  today,
}: {
  unitLabel: string;
  tenantName: string;
  terms: TermsForDescription & { startDate: IsoDate; endDate: IsoDate };
  reminderConfig: ReminderConfig;
  today: IsoDate;
}) {
  const datesOk =
    isIsoDate(terms.startDate) && isIsoDate(terms.endDate) && terms.endDate > terms.startDate;
  const schedule = datesOk ? reminderSchedule(terms.startDate, terms.endDate, reminderConfig) : [];
  const upcoming = schedule
    .filter((r) => r.kind === "EXPIRY" && r.date >= today)
    .map((r) => r.date);
  const repeat = datesOk ? describeRepeat(reminderConfig, terms.endDate) : null;

  return (
    <div className="divide-y">
      <Row icon={DoorOpen} title="Unit">
        <p>{unitLabel}</p>
      </Row>
      <Row icon={UserRound} title="Tenant">
        <p>{tenantName}</p>
      </Row>
      <Row icon={CalendarRange} title="Dates">
        {datesOk ? (
          <p>
            {formatIsoDate(terms.startDate)} to {formatIsoDate(terms.endDate)} (
            {formatDuration(terms.startDate, terms.endDate)})
          </p>
        ) : (
          <p className="text-destructive">Dates are missing.</p>
        )}
      </Row>
      <Row icon={Wallet} title="Money">
        {describeTerms(terms).map((l) => (
          <p key={l}>{l}</p>
        ))}
      </Row>
      <Row icon={BellRing} title="Reminders">
        {upcoming.length > 0 ? (
          <p>
            We will email the Leasing team on <strong>{formatDateList(upcoming)}</strong>.
          </p>
        ) : (
          <p>All the usual reminder dates for this lease have already passed.</p>
        )}
        {repeat ? <p className="text-muted-foreground">{repeat}</p> : null}
      </Row>
    </div>
  );
}
