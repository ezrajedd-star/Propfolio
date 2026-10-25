import { Button, Section, Text } from "@react-email/components";

import type { DigestItem } from "@/domain/reminders/digest";
import { EmailLayout, buttonStyle, textStyle } from "./layout";

export interface OverdueSummary {
  count: number;
  totalLabel: string;
  url: string;
}

export function DigestEmail({
  companyName,
  dateLabel,
  items,
  overdue,
  leasesUrl,
}: {
  companyName: string;
  dateLabel: string;
  items: DigestItem[];
  overdue?: OverdueSummary;
  leasesUrl: string;
}) {
  return (
    <EmailLayout
      preview={`${items.length} lease${items.length === 1 ? " needs" : "s need"} attention`}
      companyName={companyName}
    >
      <Text style={{ ...textStyle, fontSize: 20, fontWeight: 700 }}>
        Lease reminders for {dateLabel}
      </Text>
      <Text style={textStyle}>
        {items.length === 1 ? "This lease needs" : `These ${items.length} leases need`} attention.
        Open a lease to renew it, or mark the reminder as handled to stop further emails about it.
      </Text>
      {items.map((i) => (
        <Section key={i.leaseId} style={{ borderTop: "1px solid #e3e8ea", padding: "14px 0" }}>
          <Text style={{ ...textStyle, margin: "0 0 4px", fontWeight: 700 }}>
            {i.tenantName} · {i.unitLabel}, {i.buildingName}
          </Text>
          <Text style={{ ...textStyle, margin: "0 0 4px" }}>
            {i.timeLeft} · {i.refNo}
          </Text>
          <Text style={{ ...textStyle, margin: "0 0 10px", color: "#5b6670", fontSize: 15 }}>
            {i.reason}
          </Text>
          <Button href={i.url} style={{ ...buttonStyle, padding: "8px 14px", fontSize: 15 }}>
            Open lease
          </Button>
        </Section>
      ))}
      {overdue && overdue.count > 0 ? (
        <Section style={{ borderTop: "1px solid #e3e8ea", paddingTop: 14 }}>
          <Text style={{ ...textStyle, fontWeight: 700, margin: "0 0 4px" }}>Overdue payments</Text>
          <Text style={textStyle}>
            {overdue.count} overdue charge{overdue.count === 1 ? "" : "s"}, {overdue.totalLabel} in
            total. <a href={overdue.url}>See the overdue list</a>
          </Text>
        </Section>
      ) : null}
      <Text style={{ ...textStyle, fontSize: 14, color: "#5b6670", marginTop: 16 }}>
        All leases: <a href={leasesUrl}>{leasesUrl}</a>
      </Text>
    </EmailLayout>
  );
}
