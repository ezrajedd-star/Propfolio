# Playbook: follow-ups and nurture emails

## Personal follow-ups (FOLLOW_UP_DRAFT)

The founder sends these from their own email, LinkedIn or Viber. Write as them, first person,
one idea per message:

- Start with what you know from the lead ("You added 12 units last week — nice start.").
- Offer one concrete help ("Want me to show you how to add the leases from your Excel in 10
  minutes?").
- End with an easy yes ("Free for a quick call Thursday?").
- Under 90 words. No links unless helpful (the help article or pricing page).

## Trial nurture emails (NURTURE_EMAIL)

Only for leads with marketingConsent true. One per stuck step:

- Units but no leases → how to import leases from Excel.
- No units after 3 days → the 2-minute set-up.
- Trial ending in 3 days → what they keep on Free, what Pro and Premium add (list prices only).

Subject under 50 characters, body under 150 words, one button-like line ("Open Propfolio").

## Lead upkeep (lead_update)

- A lead with no follow-up date: suggest one (next working day for hot leads, a week for
  others) with a short note.
- Move to Contacted only if the timeline shows a call, email or message. Never to Paying or
  Lost.
