/**
 * Add a platform admin (Propfolio staff), or start set-up again for one who lost their phone.
 * Prints a one-time set-up link (valid 24 hours) where they choose a password and connect an
 * authenticator app. Run on the server:
 *
 *   pnpm platform:admin --email you@example.com --name "Your Name"
 *
 * In Docker: docker compose run --rm migrate pnpm platform:admin --email … --name "…"
 * Running it again for the same email clears their password and authenticator, signs them out,
 * and prints a fresh link.
 */
import { parseArgs } from "node:util";

import { db } from "../src/server/db";
import { issuePlatformSetupLink, SETUP_LINK_HOURS } from "../src/server/platform/auth";

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
  });
  const email = values.email?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: pnpm platform:admin --email you@example.com --name "Your Name"');
    process.exitCode = 1;
    return;
  }
  const link = await issuePlatformSetupLink({ email, name: values.name });
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
