# Decisions

Short records of choices that differ from, or refine, the original brief.

## 1. Own session handling instead of Auth.js (Phase 1)

The brief suggests Auth.js with the credentials provider and database sessions. Auth.js does not
support database sessions with the credentials provider (it forces JWT sessions), and v5 is
still a beta. We also needed custom behaviour anyway: lockout, a forced password change at first
sign-in, a 30-minute idle timeout, and ending sessions immediately when a role changes or an
account is turned off.

So we keep a small session layer (`src/server/auth/`). It uses a random 256-bit token in an
httpOnly cookie, stores only the token's SHA-256 hash in the `Session` table, and checks idle and
absolute expiry on every request. This matches what the brief asks for ("database sessions") and
is fully covered by tests.

## 2. Next.js 15.5 and Prisma 6

At build time the newest majors were Next.js 16 and a Prisma 8 release candidate. We pinned the
latest patch releases of Next.js 15.5 and Prisma 6.19, which are mature and widely deployed.
They can be upgraded later in a dedicated change. Every dependency version is pinned exactly.

## 3. Hand-written shadcn/ui components

The shadcn registry wasn't reachable from the build environment, so the components in
`src/components/ui` are written in the shadcn style on top of `radix-ui` primitives. They are
plain source files that we own and can change, exactly as shadcn intends.

## 4. Native `<select>` for simple choices

For non-technical users and phones, the browser's own dropdown is the most familiar and
accessible option. Custom listboxes are kept for cases that need search.

## 5. Temporary passwords for new accounts

When an Admin creates an account, Propfolio shows a one-time temporary password (once) for the
Admin to hand over. The user must replace it at first sign-in (brief §2). The password is never
emailed. "Reset password" emails a single-use link, as the brief asks.

## 6. `SameSite=Lax` session cookie

`Strict` would make links in reminder emails open the sign-in page even for signed-in users.
`Lax` keeps those links working. Cross-site form posts are still blocked by Origin checks on
every state-changing request.

## 7. Showing the "locked" message

When an account is locked, the sign-in page says so and tells the user when to try again. This
reveals that the account exists, but only after 5 wrong attempts. For an internal staff tool,
clear guidance matters more than hiding which emails have accounts. Unknown emails and single
wrong passwords still get the same generic message.
