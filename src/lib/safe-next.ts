/** Only allow redirects to paths inside this app (never another site, even via `//host`). */
export function safeNext(next: unknown): string {
  return typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
    ? next
    : "/";
}
