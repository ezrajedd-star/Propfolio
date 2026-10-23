import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

export const BRAND = "#0f766e";

export function EmailLayout({
  preview,
  companyName,
  children,
}: {
  preview: string;
  companyName: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: "#f5f7f8",
          fontFamily: "Inter, Segoe UI, Arial, sans-serif",
          margin: 0,
        }}
      >
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
          <Text style={{ fontSize: 18, fontWeight: 700, color: BRAND, margin: "0 0 16px" }}>
            {companyName} · Propfolio
          </Text>
          <Section
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              padding: "24px",
              border: "1px solid #e3e8ea",
            }}
          >
            {children}
          </Section>
          <Hr style={{ borderColor: "#e3e8ea", margin: "24px 0 12px" }} />
          <Text style={{ fontSize: 13, color: "#5b6670", margin: 0 }}>
            This is an automatic message from Propfolio. Please don&apos;t reply to it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const textStyle = { fontSize: 16, lineHeight: "24px", color: "#1d2830", margin: "0 0 16px" };

export const buttonStyle = {
  backgroundColor: BRAND,
  color: "#ffffff",
  borderRadius: 8,
  padding: "12px 20px",
  fontSize: 16,
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};
