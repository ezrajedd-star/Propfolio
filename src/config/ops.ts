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
