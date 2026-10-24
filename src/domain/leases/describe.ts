import { formatPeso } from "../money/money";
import { formatIsoDate } from "../time/manila";

export interface TermsForDescription {
  monthlyRent: string;
  rentDueDay: number | string;
  securityDeposit: string;
  advanceRentType: "NONE" | "MONTHS" | "AMOUNT";
  advanceRentMonths?: number | string | null;
  advanceRentAmount?: string | null;
  escalationType: "NONE" | "PERCENT" | "SCHEDULE";
  escalationPercent?: string | null;
  escalationEveryMonths?: number | string | null;
  escalationSteps?: { date: string; monthlyRent: string }[] | null;
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** Lease money terms as short plain-language sentences. */
export function describeTerms(t: TermsForDescription): string[] {
  const money = (v: string | null | undefined) => formatPeso((v ?? "0").replace(/,/g, "") || "0");
  const lines = [
    `Rent is ${money(t.monthlyRent)} a month, due on the ${ordinal(Number(t.rentDueDay))} of each month.`,
    `Security deposit: ${money(t.securityDeposit)}.`,
  ];
  if (t.advanceRentType === "MONTHS") {
    const n = Number(t.advanceRentMonths);
    lines.push(`Advance rent: ${n} month${n === 1 ? "" : "s"}.`);
  } else if (t.advanceRentType === "AMOUNT") {
    lines.push(`Advance rent: ${money(t.advanceRentAmount)}.`);
  } else {
    lines.push("No advance rent.");
  }
  if (t.escalationType === "PERCENT") {
    lines.push(
      `Rent goes up ${Number(t.escalationPercent)}% every ${t.escalationEveryMonths} months.`,
    );
  } else if (t.escalationType === "SCHEDULE") {
    for (const s of [...(t.escalationSteps ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
      lines.push(`From ${formatIsoDate(s.date)}, rent becomes ${money(s.monthlyRent)} a month.`);
    }
  } else {
    lines.push("Rent stays the same for the whole lease.");
  }
  return lines;
}
