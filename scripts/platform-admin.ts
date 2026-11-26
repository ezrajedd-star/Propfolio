/**
 * Add a platform admin (Propfolio staff), or start set-up again for one who lost their phone.
 * Prints a one-time set-up link (valid 24 hours) where they choose a password and connect an
 * authenticator app. Run on the server:
 *
 *   pnpm platform:admin --email you@example.com --name "Your Name" [--role owner|support|readonly]
 *
 * The first person becomes a Platform Owner. Others start read-only unless --role says otherwise;
 * a Platform Owner can change roles later in the console (Staff).
 * On the server: cd /opt/propfolio/deploy && docker compose run --rm platform-admin --email … --name "…"
 * Running it again for the same email clears their password and authenticator, signs them out,
 * and prints a fresh link.
 */
import { parseArgs } from "node:util";

import type { PlatformRole } from "../src/domain/platform/roles";
import { asSystem, db } from "../src/server/db";
import { issuePlatformSetupLink, SETUP_LINK_HOURS } from "../src/server/platform/auth";

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string" } },
  });
  const roles: Record<string, PlatformRole> = {
    owner: "PLATFORM_OWNER",
    support: "PLATFORM_SUPPORT",
    readonly: "PLATFORM_READONLY",
  };
  if (values.role && !roles[values.role]) {
    console.error("--role must be owner, support or readonly");
    process.exitCode = 1;
    return;
  }
  const email = values.email?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: pnpm platform:admin --email you@example.com --name "Your Name"');
    process.exitCode = 1;
    return;
  }
  const owners = await asSystem(() =>
    db.platformAdmin.count({ where: { role: "PLATFORM_OWNER", isActive: true } }),
  );
  const role = values.role ? roles[values.role] : owners === 0 ? "PLATFORM_OWNER" : undefined;
  const link = await issuePlatformSetupLink({ email, name: values.name, role });
  console.log(
    `\nSet-up link for ${email} (works once, for ${SETUP_LINK_HOURS} hours):\n\n${link}\n`,
  );
  console.log("Open it on a computer, with your phone and an authenticator app at hand.\n");
}

main()
  .catch((err: unknown) => {
    console.error("Could not create the set-up link:", err instanceof Error ? err.name : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
