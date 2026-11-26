import { Button, Text } from "@react-email/components";

import { EmailLayout, buttonStyle, textStyle } from "./layout";

export function TicketReceivedEmail({
  name,
  number,
  subject,
  url,
}: {
  name: string;
  number: string;
  subject: string;
  url: string;
}) {
  return (
    <EmailLayout preview={`We got your request ${number}`} companyName="Propfolio support">
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>
        Thanks for writing to us. We got your request {number}: &ldquo;{subject}&rdquo;. We usually
        answer within one working day.
      </Text>
      <Button href={url} style={buttonStyle}>
        See my request
      </Button>
      <Text style={{ ...textStyle, marginTop: 16 }}>
        To add something, reply from the request in Propfolio (Help → My requests).
      </Text>
    </EmailLayout>
  );
}

export function TicketReplyEmail({
  name,
  number,
  reply,
  from,
  url,
  resolved,
}: {
  name: string;
  number: string;
  reply: string;
  from: string;
  url: string;
  resolved: boolean;
}) {
  return (
    <EmailLayout preview={`Reply to your request ${number}`} companyName="Propfolio support">
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>
        {from} from Propfolio replied to your request {number}:
      </Text>
      {reply.split(/\n{2,}/).map((p, i) => (
        <Text
          key={i}
          style={{
            ...textStyle,
            whiteSpace: "pre-wrap",
            borderLeft: "3px solid #e3e8ea",
            paddingLeft: 12,
          }}
        >
          {p}
        </Text>
      ))}
      <Button href={url} style={buttonStyle}>
        Reply in Propfolio
      </Button>
      <Text style={{ ...textStyle, marginTop: 16 }}>
        {resolved
          ? "We've marked this request as resolved. If it isn't, just reply and it opens again."
          : "Please reply from the request in Propfolio, so everything stays in one place."}
      </Text>
    </EmailLayout>
  );
}
