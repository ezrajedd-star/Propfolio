import type { OccupancyCounts } from "@/domain/leases/occupancy";

/**
 * Occupied / vacant / unavailable as a simple stacked bar. Each part is labelled in text below,
 * so the colours are never the only way to read it.
 */
export function OccupancyBar({ counts }: { counts: OccupancyCounts }) {
  const { occupied, vacant, unavailable, total } = counts;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  return (
    <div>
      <div
        className="bg-muted flex h-3 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`${occupied} occupied, ${vacant} vacant, ${unavailable} unavailable`}
      >
        <div className="bg-success" style={{ width: `${pct(occupied)}%` }} />
        <div className="bg-primary/35" style={{ width: `${pct(vacant)}%` }} />
        <div
          className="bg-[repeating-linear-gradient(45deg,var(--neutral-status)_0_3px,transparent_3px_6px)] opacity-60"
          style={{ width: `${pct(unavailable)}%` }}
        />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-success size-2.5 rounded-full" aria-hidden /> {occupied} occupied
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-primary/35 size-2.5 rounded-full" aria-hidden /> {vacant} vacant
        </span>
        {unavailable > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-neutral-status/60 size-2.5 rounded-full" aria-hidden />{" "}
            {unavailable} unavailable
          </span>
        ) : null}
        {total > 0 ? (
          <span className="font-medium">{counts.occupancyPercent}% occupied</span>
        ) : null}
      </p>
    </div>
  );
}
