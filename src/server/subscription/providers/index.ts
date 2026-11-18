import { env } from "@/server/env";
import { demoProvider } from "./demo";
import type { PaymentProvider } from "./types";
import { configuredXendit, XENDIT_PROVIDER } from "./xendit";

/**
 * The provider for new payments: `PAYMENT_PROVIDER`. The demo provider is refused on a production
 * server that isn't the test site, so nobody can "pay" with a pretend card. Xendit needs its two
 * keys set; without them, paying online is off ("Email us" to upgrade).
 */
export function activeProvider(): PaymentProvider | null {
  const e = env();
  const demoAllowed = e.NODE_ENV !== "production" || e.UAT_MODE;
  if (e.PAYMENT_PROVIDER === "demo") return demoAllowed ? demoProvider : null;
  if (e.PAYMENT_PROVIDER === "xendit") return configuredXendit();
  return null;
}

/**
 * For webhooks and renewals: the provider a payment or subscription belongs to. Xendit stays
 * reachable while its keys are set, even after switching away, so its last payments still land.
 */
export function providerFor(name: string): PaymentProvider | null {
  if (name === demoProvider.name) return activeProvider() === demoProvider ? demoProvider : null;
  if (name === XENDIT_PROVIDER) return configuredXendit();
  return null;
}
