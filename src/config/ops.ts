/**
 * Operations settings in one place: monitoring, alerts and (from phase 5) the AI agents'
 * schedules, autonomy, scoring and spending caps. Change them here, in a reviewed pull request.
 * Secrets never go here; they live in the server's environment settings.
 */

export const MONITORING = {
  /** The worker writes a heartbeat this often… */
  heartbeatCron: "*/5 * * * *",
  /** …and is shown as stopped (and the deep health check fails) after this many minutes without one. */
  workerStaleMinutes: 15,
  /** Unsent urgent alerts are retried this often by the worker. */
  alertRetryCron: "*/5 * * * *",
  /** Give up re-sending an alert after this many tries (the incident stays on System health). */
  alertMaxTries: 6,
  /** Incidents shown on System health. */
  recentDays: 30,
} as const;

/**
 * Pushover priorities: 2 = emergency (repeats until someone acknowledges it), 1 = high (skips
 * quiet hours), 0 = normal.
 */
export const ALERT_PRIORITY = {
  /** The site or a key part of it is down. */
  URGENT: 2,
  /** Something needs a look today (e.g. a new kind of error). */
  NORMAL: 0,
} as const;

/** While an emergency alert is unacknowledged, Pushover repeats it every `retry` seconds for up to `expire`. */
export const EMERGENCY_REPEAT = { retrySeconds: 120, expireSeconds: 3600 } as const;

/** The sales pipeline (phase 3). */
export const PIPELINE = {
  /** Lost leads are deleted this many months after they were lost (privacy). */
  lostLeadRetentionMonths: 24,
  /** Daily housekeeping time (Manila) for the retention clean-up and the Brevo sync. */
  dailyCron: "40 3 * * *",
  /**
   * Marketing emails go from this subdomain (its own sender reputation), never from the
   * domain that sends sign-in codes and reminders. Set it up in Brevo → Senders & Domains.
   */
  marketingSenderDomain: "news.propfolioph.com",
} as const;

/**
 * The Growth agent's "talk to today" list: buying signals and how much each counts. Change the
 * weights here (a reviewed change); the console's list and the agent both use them.
 */
export const BUYING_SIGNALS = {
  /** A trial that ends within this many days. */
  trialEndingDays: 7,
  trialEnding: 30,
  /** Started a trial and added units, but no lease yet: stuck at the last step. */
  unitsButNoLeases: 20,
  /** Asked for a demo within this many days. */
  demoRequestDays: 7,
  demoRequest: 25,
  /** The follow-up date is today or past. */
  followUpDue: 15,
  /** Used Propfolio within this many days (they're engaged). */
  recentlyActiveDays: 3,
  recentlyActive: 10,
  /** Nobody has been in touch for this many days. */
  quietDays: 14,
  quiet: 10,
  /** Came through someone they know. */
  referral: 10,
  /** Per 10 units of portfolio (bigger customers first), up to the maximum below. */
  per10Units: 2,
  portfolioMax: 20,
  /** How many leads the daily list shows. */
  listSize: 10,
} as const;

/** When the Growth agent runs (Manila time). */
export const GROWTH_SCHEDULE = {
  /** Weekdays: pipeline upkeep, the "talk to today" list and follow-up drafts. */
  dailyCron: "10 8 * * 1-5",
  /** Mondays: content calendar with draft posts, and the weekly report. */
  weeklyCron: "40 8 * * 1",
} as const;
