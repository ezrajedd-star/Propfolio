import { Button, Hr, Link, Section, Text } from "@react-email/components";

import type { DigestRow } from "@/domain/digest/digest";
import { EmailLayout, buttonStyle, textStyle } from "./layout";

export interface DigestEmailProps {
  weekLabel: string;
  summary: string | null;
  attention: string[];
  rows: DigestRow[];
  agents: { name: string; lines: string[]; spent: string; cap: string }[];
  consoleUrl: string;
}

const cell = { ...textStyle, margin: 0, padding: "6px 0" };

export function MondayDigestEmail({
  weekLabel,
  summary,
  attention,
  rows,
  agents,
  consoleUrl,
}: DigestEmailProps) {
  return (
    <EmailLayout preview={`Your Monday digest: ${weekLabel}`} companyName="Propfolio console">
      <Text style={{ ...textStyle, fontSize: 20, fontWeight: 700 }}>
        Monday digest · {weekLabel}
      </Text>
      {summary ? <Text style={textStyle}>{summary}</Text> : null}
      <Text style={{ ...textStyle, fontWeight: 700 }}>Needs you this week</Text>
      {attention.length ? (
        attention.map((a) => (
          <Text key={a} style={{ ...textStyle, margin: "4px 0" }}>
            • {a}
          </Text>
        ))
      ) : (
        <Text style={textStyle}>Nothing urgent. 🎉</Text>
      )}
      <Text style={{ ...textStyle, margin: "8px 0" }}>
        {[
          ["Approvals", "/approvals"],
          ["Tickets", "/tickets"],
          ["System health", "/health"],
          ["Agents", "/agents"],
        ].map(([label, path], i) => (
          <span key={path}>
            {i > 0 ? " · " : ""}
            <Link href={`${consoleUrl}${path}`}>{label}</Link>
          </span>
        ))}
      </Text>
      <Hr />
      <Text style={{ ...textStyle, fontWeight: 700 }}>The numbers</Text>
      <Section>
        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td style={cell}>{r.label}</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{r.now}</td>
                <td style={{ ...cell, textAlign: "right", color: "#667085", paddingLeft: 12 }}>
                  {r.change ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Hr />
      <Text style={{ ...textStyle, fontWeight: 700 }}>What the agents did last week</Text>
      {agents.map((a) => (
        <Section key={a.name}>
          <Text style={{ ...textStyle, margin: "8px 0 2px", fontWeight: 600 }}>
            {a.name} · {a.spent} of {a.cap} this month
          </Text>
          {a.lines.length ? (
            a.lines.map((l) => (
              <Text key={l} style={{ ...textStyle, margin: "2px 0" }}>
                • {l}
              </Text>
            ))
          ) : (
            <Text style={{ ...textStyle, margin: "2px 0" }}>Nothing.</Text>
          )}
        </Section>
      ))}
      <Button href={consoleUrl} style={{ ...buttonStyle, marginTop: 16 }}>
        Open the console
      </Button>
    </EmailLayout>
  );
}
