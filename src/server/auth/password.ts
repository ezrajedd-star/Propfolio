import { hash, verify } from "@node-rs/argon2";

// argon2id with OWASP-recommended parameters (19 MiB, 2 iterations, 1 lane).
const OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id (a const enum, so it cannot be imported under isolatedModules)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Spend the same time as a real check when the account does not exist, so response
 * timing does not reveal which email addresses have accounts.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("propfolio-timing-equaliser");
  await verifyPassword(await dummyHash, password);
}
