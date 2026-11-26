# support@ email to tickets: recommendation (not built)

_The brief asked for a recommendation only. Nothing here is built._

## Today

- Customers ask for help with the **Help** button in the app. It makes a ticket linked to their
  account, and replies go out by email (Brevo) with "Reply in Propfolio".
- Emails to support@ (or hello@) arrive in your Gmail through Namecheap's free forwarding.
  They are not tickets.

## Recommendation: Brevo inbound parsing, in about 2–3 days of work, when email volume grows

1. Point support@propfolioph.com's MX record to **Brevo's inbound parsing** (included in Brevo's
   plans) instead of Namecheap forwarding. Brevo turns each email into a webhook call to
   Propfolio.
2. Propfolio checks the sender: an email from a known customer's address joins their open ticket
   (matched by "T-1234" in the subject) or opens a new one; anyone else goes to an "Unmatched"
   list in the console, never straight into an account.
3. Attachments: images only, scanned like documents. Quoted earlier messages are trimmed.
4. Replies keep going out from the console as today.

**Why this way:** one inbox (the console), no new tool to pay for, and it reuses the ticket,
masking and Support agent pieces already built.

**Alternatives considered:**

| Option                        | Cost             | Why not now                                                       |
| ----------------------------- | ---------------- | ----------------------------------------------------------------- |
| Help Scout / Freshdesk        | US$20+/person/mo | A second inbox and a second customer list to keep in sync.        |
| Gmail API polling             | Free             | Needs Google Workspace and OAuth upkeep; slower and more fragile. |
| Keep Gmail forwarding (today) | Free             | Fine while email volume is low.                                   |

**When to do it:** when more than about 5 support emails a week arrive outside the Help button.
