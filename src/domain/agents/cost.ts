/** What an agent's work cost, in US dollars (decimal, never floats). Pure. */
import Decimal from "decimal.js";

import { MODEL_PRICES, SESSION_HOUR_USD } from "@/config/agents";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Managed Agents session time. */
  sessionHours?: number;
}

const D = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export function usageCost(model: string, u: Usage): Decimal {
  const p = MODEL_PRICES[model];
  if (!p) throw new Error(`No price for model ${model}`);
  const perToken = (price: string, tokens = 0) => new D(price).times(tokens).dividedBy(1_000_000);
  return perToken(p.input, u.inputTokens)
    .plus(perToken(p.output, u.outputTokens))
    .plus(perToken(p.cacheRead, u.cacheReadTokens))
    .plus(perToken(p.cacheWrite, u.cacheWriteTokens))
    .plus(new D(SESSION_HOUR_USD).times(u.sessionHours ?? 0))
    .toDecimalPlaces(4);
}

export function overCap(spentUsd: Decimal.Value, capUsd: Decimal.Value): boolean {
  return new D(spentUsd).greaterThanOrEqualTo(capUsd);
}

/** Dollars for display: "$12.34". */
export function formatUsd(v: Decimal.Value): string {
  return `$${new D(v).toFixed(2)}`;
}

export function capPercent(spentUsd: Decimal.Value, capUsd: Decimal.Value): number {
  const cap = new D(capUsd);
  if (cap.isZero()) return 100;
  return Math.min(100, new D(spentUsd).dividedBy(cap).times(100).toDecimalPlaces(0).toNumber());
}
