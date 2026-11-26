import { describe, expect, it } from "vitest";

import { nextTicketStatus, ticketNumber, ticketSubject, type TicketStatus } from "./tickets";

describe("nextTicketStatus", () => {
  it.each([
    ["NEW", "customer_message", "NEW"],
    ["WAITING_ON_CUSTOMER", "customer_message", "WAITING_ON_US"],
    ["RESOLVED", "customer_message", "WAITING_ON_US"],
    ["WAITING_ON_US", "customer_message", "WAITING_ON_US"],
    ["NEW", "staff_reply", "WAITING_ON_CUSTOMER"],
    ["WAITING_ON_US", "staff_reply", "WAITING_ON_CUSTOMER"],
    ["NEW", "staff_note", "NEW"],
    ["WAITING_ON_US", "staff_note", "WAITING_ON_US"],
    ["WAITING_ON_CUSTOMER", "resolve", "RESOLVED"],
    ["RESOLVED", "reopen", "WAITING_ON_US"],
  ] as const)("%s + %s → %s", (from, event, to) => {
    expect(nextTicketStatus(from as TicketStatus, event)).toBe(to);
  });
});

describe("ticketSubject", () => {
  it.each([
    ["How do I add a unit?", "How do I add a unit?"],
    ["  First line\nsecond line", "First line"],
    ["a   lot    of   spaces", "a lot of spaces"],
    [
      "This is a very long description that goes on and on about the problem with the lease renewal screen",
      "This is a very long description that goes on and on about the problem with the…",
    ],
  ])("%j", (input, subject) => {
    expect(ticketSubject(input)).toBe(subject);
  });
});

it("ticketNumber", () => {
  expect(ticketNumber(1001)).toBe("T-1001");
});
