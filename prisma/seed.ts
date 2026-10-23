/**
 * Synthetic seed data for development and demos. NEVER run against production.
 *
 * Users get freshly generated passwords on every run (printed below), unless you set
 * SEED_PASSWORD to use one known password for all seed users (handy for local testing).
 * All names and emails are fictional; emails use the reserved `.test` domain.
 */
import { randomBytes } from "node:crypto";

import { PrismaClient, type Role } from "@prisma/client";

import { hashPassword } from "../src/server/auth/password";

const db = new PrismaClient();

const SEED_USERS: { name: string; email: string; role: Role }[] = [
  { name: "Andrea Admin", email: "admin@propfolio.test", role: "ADMIN" },
  { name: "Lea Leasing", email: "leasing@propfolio.test", role: "LEASING_STAFF" },
  { name: "Victor Viewer", email: "viewer@propfolio.test", role: "VIEWER" },
];

function generatedPassword(): string {
  return randomBytes(12).toString("base64url");
}

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--allow-production")) {
    throw new Error("Refusing to seed a production database.");
  }

  const credentials: { email: string; role: Role; password: string }[] = [];
  for (const u of SEED_USERS) {
    const password = process.env.SEED_PASSWORD ?? generatedPassword();
    const passwordHash = await hashPassword(password);
    await db.user.upsert({
      where: { email: u.email },
      create: { ...u, passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
      update: { passwordHash, isActive: true, failedLoginCount: 0, lockedUntil: null },
    });
    credentials.push({ email: u.email, role: u.role, password });
  }

  await db.setting.upsert({
    where: { key: "companyName" },
    create: { key: "companyName", value: "Sample Realty Corp." },
    update: {},
  });

  console.log("\nSeed users (synthetic test accounts):");
  console.table(credentials);
  console.log("These passwords change every time you run the seed unless SEED_PASSWORD is set.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
