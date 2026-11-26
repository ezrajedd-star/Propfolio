# Playbook: weekly dependency and security check

1. Run `pnpm audit --prod` and `pnpm outdated`.
2. **Security first.** For any advisory rated high or critical with a fixed version: update that
   package to the fixed version (exact version in `package.json`, no `^` or `~`).
3. **Then patch updates** (1.2.3 → 1.2.4) of direct dependencies, at most 10 packages. Minor
   updates only for dev tools. **No major updates** (1.x → 2.x): list them in the pull request
   for a person to plan.
4. `pnpm install`, then all the checks: `pnpm lint && pnpm typecheck && pnpm test &&
pnpm test:integration`. If an update breaks a check, leave that one out and say so.
5. **One pull request** from `agent/deps-<date>`, titled "Weekly dependency updates <date>":
   a table of package, from, to and why (security advisory id, or patch), the majors left for
   later, and **Risk: low** (patches only) or **medium** (security fix in a core package: Next.js,
   Prisma, auth).
6. Nothing to update and no advisories: open no pull request.
