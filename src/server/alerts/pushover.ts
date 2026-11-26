import { EMERGENCY_REPEAT } from "@/config/ops";
import { env } from "@/server/env";

/**
 * Push alerts to phones through Pushover. Messages carry what broke and a console link, never
 * personal data. Without PUSHOVER_APP_TOKEN and PUSHOVER_USER_KEY nothing is sent.
 */
export interface PushMessage {
  title: string;
  message: string;
  /** 2 emergency (repeats until acknowledged), 1 high, 0 normal. */
  priority: 0 | 1 | 2;
  url?: string;
}

export type PushSender = (msg: PushMessage) => Promise<{ sent: number; failed: number }>;

export function pushConfigured(): boolean {
  const e = env();
  return Boolean(e.PUSHOVER_APP_TOKEN && e.PUSHOVER_USER_KEY);
}

export const sendPush: PushSender = async (msg) => {
  const e = env();
  if (!e.PUSHOVER_APP_TOKEN || !e.PUSHOVER_USER_KEY) return { sent: 0, failed: 0 };
  const users = [e.PUSHOVER_USER_KEY, e.PUSHOVER_SECOND_USER_KEY].filter(Boolean) as string[];
  let sent = 0;
  let failed = 0;
  for (const user of users) {
    const body = new URLSearchParams({
      token: e.PUSHOVER_APP_TOKEN,
      user,
      title: msg.title.slice(0, 250),
      message: msg.message.slice(0, 1000),
      priority: String(msg.priority),
      ...(msg.priority === 2
        ? {
            retry: String(EMERGENCY_REPEAT.retrySeconds),
            expire: String(EMERGENCY_REPEAT.expireSeconds),
          }
        : {}),
      ...(msg.url ? { url: msg.url, url_title: "Open the console" } : {}),
    });
    try {
      const r = await fetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) sent += 1;
      else {
        failed += 1;
        console.error(`[alerts] push refused: HTTP ${r.status}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`[alerts] push failed: ${err instanceof Error ? err.name : "unknown"}`);
    }
  }
  return { sent, failed };
};
