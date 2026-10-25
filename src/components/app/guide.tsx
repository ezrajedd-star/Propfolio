"use client";

import { ArrowLeft, ArrowRight, Lightbulb, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { saveGuideStateAction } from "@/app/(app)/guide-actions";
import { Button } from "@/components/ui/button";
import type { Role } from "@/domain/auth/roles";
import { GUIDE_HINTS, pageIntro, tourSteps, type TourStep } from "@/domain/guide/content";
import { cn } from "@/lib/utils";

// ─── State ─────────────────────────────────────────────────────────────────────

interface GuideContextValue {
  on: boolean;
  toggle: () => void;
  setOn: (on: boolean) => void;
  startTour: () => void;
}

const GuideContext = createContext<GuideContextValue | null>(null);

export function useGuide(): GuideContextValue {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useGuide must be used inside GuideProvider");
  return ctx;
}

export function GuideProvider({
  initial,
  role,
  firstName,
  uat,
  children,
}: {
  initial: { on: boolean; tourDone: boolean };
  role: Role;
  firstName: string;
  uat: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [on, setOnState] = useState(initial.on);
  // The tour starts by itself once, on Home, for people who haven't seen it.
  const [touring, setTouring] = useState(!initial.tourDone && pathname === "/");

  const setOn = useCallback((value: boolean) => {
    setOnState(value);
    void saveGuideStateAction({ on: value });
  }, []);

  const value = useMemo<GuideContextValue>(
    () => ({
      on,
      setOn,
      toggle: () => setOn(!on),
      startTour: () => {
        if (pathname !== "/") router.push("/");
        setOnState(false);
        setTouring(true);
      },
    }),
    [on, setOn, pathname, router],
  );

  return (
    <GuideContext.Provider value={value}>
      {children}
      {on && !touring ? <GuideLayer /> : null}
      {touring ? (
        <WelcomeTour
          steps={tourSteps(role, firstName, uat)}
          onClose={() => {
            setTouring(false);
            void saveGuideStateAction({ tourDone: true });
          }}
        />
      ) : null}
    </GuideContext.Provider>
  );
}

// ─── Button ────────────────────────────────────────────────────────────────────

export function GuideButton({ className }: { className?: string }) {
  const { on, toggle } = useGuide();
  return (
    <Button
      type="button"
      variant={on ? "default" : "outline"}
      onClick={toggle}
      aria-pressed={on}
      data-guide="guide-button"
      className={className}
    >
      <Lightbulb aria-hidden /> {on ? "Guide on" : "Guide"}
    </Button>
  );
}

// ─── Finding marked elements ───────────────────────────────────────────────────

interface Spot {
  id: string;
  rect: DOMRect;
}

function visibleSpots(): Spot[] {
  const seen = new Set<string>();
  const out: Spot[] = [];
  document.querySelectorAll<HTMLElement>("[data-guide]").forEach((el) => {
    const id = el.dataset.guide!;
    if (seen.has(id) || !GUIDE_HINTS[id] || el.closest("[data-guide-ignore]")) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || el.closest("[hidden],[inert]")) return;
    seen.add(id);
    out.push({ id, rect });
  });
  return out;
}

function findTarget(id: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-guide="${CSS.escape(id)}"]`);
  return [...all].find((el) => el.getBoundingClientRect().width > 0) ?? null;
}

function flash(id: string) {
  const el = findTarget(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("guide-flash");
  window.setTimeout(() => el.classList.remove("guide-flash"), 2200);
}

/** Re-measure while the Guide is open (tabs, menus and scrolling move things around). */
function useSpots(active: boolean): Spot[] {
  const [spots, setSpots] = useState<Spot[]>([]);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSpots(visibleSpots()));
    };
    update();
    const timer = window.setInterval(update, 600);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [active]);
  return spots;
}

// ─── Guide notes (badges + panel) ──────────────────────────────────────────────

/** True after the first render in the browser (portals need `document`). */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function GuideLayer() {
  const mounted = useMounted();
  const { setOn } = useGuide();
  const pathname = usePathname();
  const spots = useSpots(true);
  const [selected, setSelected] = useState<string | null>(null);
  const intro = pageIntro(pathname);
  // This page's own buttons are numbered on screen; the menu is listed (without numbers) below.
  const isMenu = (id: string) =>
    id.startsWith("nav-") || id === "guide-button" || id === "feedback-button";
  const pageSpots = spots.filter((s) => !isMenu(s.id));
  const menuSpots = spots.filter((s) => isMenu(s.id) && s.id !== "guide-button");
  const number = new Map(pageSpots.map((s, i) => [s.id, i + 1]));
  const panelItem = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOn(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOn]);

  if (!mounted) return null;
  return createPortal(
    <div data-guide-ignore>
      {pageSpots.map((s) => (
        <button
          key={s.id}
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => {
            setSelected(s.id);
            panelItem.current[s.id]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }}
          className={cn(
            "bg-primary text-primary-foreground ring-background fixed z-[60] flex size-7 items-center justify-center rounded-full text-sm font-bold shadow-md ring-2",
            selected === s.id && "ring-warning scale-110",
          )}
          style={{
            top: Math.max(4, s.rect.top - 12),
            left: Math.max(4, Math.min(window.innerWidth - 32, s.rect.left - 12)),
          }}
        >
          {number.get(s.id)}
        </button>
      ))}

      <aside
        aria-label="Guide"
        className="bg-card fixed right-3 bottom-3 left-3 z-[61] flex max-h-[55dvh] flex-col rounded-xl border shadow-2xl sm:left-auto sm:w-[24rem] lg:max-h-[75dvh]"
      >
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <p className="text-primary flex items-center gap-2 text-sm font-semibold">
              <Lightbulb className="size-4" aria-hidden /> Guide
            </p>
            <h2 className="text-lg font-semibold">{intro.title}</h2>
            {intro.body ? <p className="text-muted-foreground">{intro.body}</p> : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOn(false)}
            aria-label="Turn the Guide off"
          >
            <X aria-hidden />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {pageSpots.length ? (
            <ol className="space-y-1">
              {pageSpots.map((s) => (
                <NoteItem
                  key={s.id}
                  id={s.id}
                  label={String(number.get(s.id))}
                  selected={selected === s.id}
                  onPick={() => {
                    setSelected(s.id);
                    flash(s.id);
                  }}
                  itemRef={(el) => void (panelItem.current[s.id] = el)}
                />
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground p-2">This page has no buttons with notes yet.</p>
          )}
          {menuSpots.length ? (
            <>
              <h3 className="text-muted-foreground mt-3 px-2 text-sm font-semibold">The menu</h3>
              <ul className="space-y-1">
                {menuSpots.map((s) => (
                  <NoteItem
                    key={s.id}
                    id={s.id}
                    selected={selected === s.id}
                    onPick={() => {
                      setSelected(s.id);
                      flash(s.id);
                    }}
                  />
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <p className="text-muted-foreground border-t px-4 py-2 text-sm">
          Click a note to see where it is. Press Guide or Esc to close.
        </p>
      </aside>
    </div>,
    document.body,
  );
}

function NoteItem({
  id,
  label,
  selected,
  onPick,
  itemRef,
}: {
  id: string;
  label?: string;
  selected: boolean;
  onPick: () => void;
  itemRef?: (el: HTMLLIElement | null) => void;
}) {
  const hint = GUIDE_HINTS[id]!;
  return (
    <li ref={itemRef}>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          "hover:bg-muted flex w-full gap-3 rounded-lg p-2 text-left",
          selected && "bg-primary-soft",
        )}
      >
        {label ? (
          <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
            {label}
          </span>
        ) : (
          <span className="bg-muted size-7 shrink-0 rounded-full" aria-hidden />
        )}
        <span>
          <span className="block font-medium">{hint.title}</span>
          <span className="text-muted-foreground block">{hint.body}</span>
        </span>
      </button>
    </li>
  );
}

// ─── Welcome tour ──────────────────────────────────────────────────────────────

function WelcomeTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const mounted = useMounted();
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  useEffect(() => {
    const measure = () => {
      const el = step.target ? findTarget(step.target) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const t = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    next.current?.focus();
    return () => {
      window.clearInterval(t);
      window.removeEventListener("resize", measure);
    };
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && !last) setIndex((i) => i + 1);
      if (e.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, last, onClose]);

  if (!mounted) return null;

  // Place the card beside the highlighted item when there is room; otherwise centre it.
  const cardWidth = 360;
  const roomRight = rect && rect.right + 24 + cardWidth < window.innerWidth;
  const cardStyle: React.CSSProperties = rect
    ? roomRight
      ? {
          top: Math.min(Math.max(16, rect.top - 8), window.innerHeight - 280),
          left: rect.right + 20,
        }
      : {
          top: Math.min(rect.bottom + 16, window.innerHeight - 280),
          left: Math.max(16, Math.min(rect.left, window.innerWidth - cardWidth - 16)),
        }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return createPortal(
    <div data-guide-ignore className="fixed inset-0 z-[70]">
      {rect ? (
        <div
          aria-hidden
          className="ring-primary pointer-events-none fixed rounded-lg ring-4 transition-all duration-300"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgb(15 23 42 / 0.55)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-slate-900/55" />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="bg-card fixed w-[min(22.5rem,calc(100vw-2rem))] rounded-xl border p-5 shadow-2xl"
        style={cardStyle}
      >
        <p className="text-muted-foreground text-sm">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="mt-1 text-lg font-semibold">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-2">
          {step.body}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose}>
            {last ? "Close" : "Skip tour"}
          </Button>
          <div className="flex gap-2">
            {index > 0 ? (
              <Button variant="outline" onClick={() => setIndex(index - 1)} aria-label="Back">
                <ArrowLeft aria-hidden />
              </Button>
            ) : null}
            <Button ref={next} onClick={() => (last ? onClose() : setIndex(index + 1))}>
              {last ? "Finish" : index === 0 ? "Show me around" : "Next"}
              {last ? null : <ArrowRight aria-hidden />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
