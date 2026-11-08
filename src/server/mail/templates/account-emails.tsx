import { Button, Text } from "@react-email/components";

import { EmailLayout, buttonStyle, textStyle } from "./layout";

interface Base {
  companyName: string;
  name: string;
}

export function PasswordResetEmail({
  companyName,
  name,
  url,
  validMinutes,
}: Base & { url: string; validMinutes: number }) {
  return (
    <EmailLayout preview="Set a new Propfolio password" companyName={companyName}>
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>
        Someone asked to set a new password for your Propfolio account. Click the button below to
        choose a new one. The link works for {validMinutes} minutes and can only be used once.
      </Text>
      <Button href={url} style={buttonStyle}>
        Set a new password
      </Button>
      <Text style={{ ...textStyle, marginTop: 16 }}>
        If you didn&apos;t ask for this, you can ignore this email. Your password won&apos;t change.
      </Text>
    </EmailLayout>
  );
}

export function PasswordChangedEmail({ companyName, name, when }: Base & { when: string }) {
  return (
    <EmailLayout preview="Your Propfolio password was changed" companyName={companyName}>
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>Your Propfolio password was changed on {when}.</Text>
      <Text style={textStyle}>
        If this wasn&apos;t you, contact your Propfolio Admin straight away so they can lock your
        account.
      </Text>
    </EmailLayout>
  );
}

export function EmailChangedEmail({
  companyName,
  name,
  when,
  newEmail,
}: Base & { when: string; newEmail: string }) {
  return (
    <EmailLayout preview="Your Propfolio email address was changed" companyName={companyName}>
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>
        The email address for your Propfolio account was changed to {newEmail} on {when}. From now
        on, use the new address to sign in.
      </Text>
      <Text style={textStyle}>
        If you didn&apos;t expect this, contact your Propfolio Admin straight away.
      </Text>
    </EmailLayout>
  );
}

export function TrialEndingEmail({
  companyName,
  name,
  lastDay,
  daysLeftText,
  planUrl,
  freeUnits,
}: Base & { lastDay: string; daysLeftText: string; planUrl: string; freeUnits: number }) {
  return (
    <EmailLayout preview={`Your free Premium trial ends ${daysLeftText}`} companyName={companyName}>
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>
        Your free Premium trial of Propfolio ends {daysLeftText}, on {lastDay}.
      </Text>
      <Text style={textStyle}>
        When it ends, nothing is deleted. Your account moves to the Free plan: everything stays
        visible, and exports and the privacy tools keep working. If you have more than {freeUnits}{" "}
        units, the account becomes read-only until you upgrade. Your team&apos;s sign-ins are
        paused; you keep yours.
      </Text>
      <Button href={planUrl} style={buttonStyle}>
        See plans
      </Button>
      <Text style={{ ...textStyle, marginTop: 16 }}>
        Upgrading at any time gives you everything back straight away.
      </Text>
    </EmailLayout>
  );
}

export function SignUpCodeEmail({
  name,
  code,
  validMinutes,
}: {
  name: string;
  code: string;
  validMinutes: number;
}) {
  return (
    <EmailLayout preview={`Your Propfolio code is ${code}`} companyName="Propfolio">
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>Type this code on the sign-up screen to confirm your email:</Text>
      <Text style={{ ...textStyle, fontSize: 32, letterSpacing: 6, fontWeight: 700 }}>
        {code.slice(0, 3)} {code.slice(3)}
      </Text>
      <Text style={textStyle}>
        It works for {validMinutes} minutes. If you didn&apos;t try to sign up for Propfolio, you
        can ignore this email.
      </Text>
    </EmailLayout>
  );
}

/** Subscription news for the Owner: payment received or failed, plan changed, moved to Free. */
export function SubscriptionEmail({
  companyName,
  name,
  preview,
  paragraphs,
  buttonText,
  buttonUrl,
}: Base & {
  preview: string;
  paragraphs: string[];
  buttonText?: string;
  buttonUrl?: string;
}) {
  return (
    <EmailLayout preview={preview} companyName={companyName}>
      <Text style={textStyle}>Hi {name},</Text>
      {paragraphs.map((p) => (
        <Text key={p} style={textStyle}>
          {p}
        </Text>
      ))}
      {buttonText && buttonUrl ? (
        <Button href={buttonUrl} style={buttonStyle}>
          {buttonText}
        </Button>
      ) : null}
    </EmailLayout>
  );
}

export function InvitationEmail({
  companyName,
  inviterName,
  roleLabel,
  url,
  validDays,
}: {
  companyName: string;
  inviterName: string;
  roleLabel: string;
  url: string;
  validDays: number;
}) {
  return (
    <EmailLayout
      preview={`${inviterName} invited you to ${companyName} on Propfolio`}
      companyName={companyName}
    >
      <Text style={textStyle}>Hello,</Text>
      <Text style={textStyle}>
        {inviterName} invited you to join {companyName} on Propfolio, the lease ledger, as{" "}
        {roleLabel}.
      </Text>
      <Button href={url} style={buttonStyle}>
        Join {companyName}
      </Button>
      <Text style={{ ...textStyle, marginTop: 16 }}>
        You&apos;ll choose your own password, or continue with Google. The link works for{" "}
        {validDays} days. If you weren&apos;t expecting this, you can ignore this email.
      </Text>
    </EmailLayout>
  );
}
