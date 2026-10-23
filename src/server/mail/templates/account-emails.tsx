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
