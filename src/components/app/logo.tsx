import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-lg font-semibold", className)}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M9 23V9h8a5 5 0 0 1 0 10h-4"
          fill="none"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M13 23h10" stroke="white" strokeWidth="2.6" strokeLinecap="round" opacity=".6" />
      </svg>
      Propfolio
    </span>
  );
}
