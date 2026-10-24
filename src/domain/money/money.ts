import Decimal from "decimal.js";

/**
 * Money is always a decimal.js value (never a JS float). Amounts are PHP with 2 decimal places,
 * stored as NUMERIC(14,2). All rounding goes through `roundMoney`.
 */
export type Money = Decimal;

const MoneyDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Largest value that fits NUMERIC(14,2). */
export const MAX_MONEY = new MoneyDecimal("999999999999.99");

export function money(value: Decimal.Value): Money {
  return new MoneyDecimal(value);
}

/** Round to centavos, half away from zero (₱0.005 → ₱0.01). */
export function roundMoney(value: Decimal.Value): Money {
  return new MoneyDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Parse what a person typed: "50000", "50,000.00", "₱ 50,000.5". Returns null when it isn't a
 * valid amount or has more than 2 decimal places.
 */
export function parseMoney(input: string): Money | null {
  const cleaned = input.replace(/[₱,\s]/g, "").replace(/^PHP/i, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return new MoneyDecimal(cleaned);
}

/** `₱12,500.00` (negative amounts as `-₱1,000.00`). */
export function formatPeso(value: Decimal.Value | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = roundMoney(value);
  // Group digits on the string itself so no float is ever involved.
  const [whole = "0", cents = "00"] = d.abs().toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${d.isNegative() && !d.isZero() ? "-" : ""}₱${grouped}.${cents}`;
}

/** Fixed 2-decimal string for storage and transport, e.g. "12500.00". */
export function moneyString(value: Decimal.Value): string {
  return roundMoney(value).toFixed(2);
}
