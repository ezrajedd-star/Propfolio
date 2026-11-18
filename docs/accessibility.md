# Accessibility

_Last reviewed 18 Nov 2026._

## Checked automatically, on every change

`e2e/accessibility.spec.ts` runs **axe-core** (WCAG 2.1 levels A and AA) on 40 screens: every
website page, sign-in and sign-up, and every main app screen (home, calendar, leases, units,
tenants, payments, reports, plan, every settings page, a lease and a tenant). Any problem fails
the build.

The first run (18 Nov 2026) found, and we fixed:

- The amber "warning" colour (test-site banner, placeholders, "Expiring" badges) was slightly too
  light: contrast 4.39:1, below the 4.5:1 minimum. Darkened everywhere through its colour token.
- Home page: the "How it works" steps were list items outside their list.
- Leases grid: an empty editable cell's spoken name didn't include its visible text ("Add…").

Also checked by hand: every main screen has a plain empty state with one clear next step (the
Units screen's link became a button like the others).

## Still needs a person (before launch)

Automated checks find roughly a third of accessibility problems. Once, before launch:

- [ ] Use the whole app with the keyboard only (Tab, Shift+Tab, Enter, Esc): sign in, add a
      lease, record a payment, close a dialog. Focus is always visible and never lost.
- [ ] Use it with a screen reader (VoiceOver on a Mac or iPhone, or NVDA on Windows) for the same
      tasks.
- [ ] Zoom the browser to 200%: nothing is cut off or overlaps.
- [ ] On a phone, with the system text size set larger.
