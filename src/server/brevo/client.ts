import { env } from "@/server/env";

/**
 * Brevo contacts API (marketing list only). Only leads who agreed to marketing are ever sent.
 * Without BREVO_API_KEY and BREVO_MARKETING_LIST_ID nothing is sent ("not connected").
 */
export interface BrevoContact {
  email: string;
  name: string;
  company: string;
}

export interface BrevoClient {
  connected: boolean;
  /** Add or update a contact on the marketing list. */
  addToMarketing(contact: BrevoContact): Promise<void>;
  /** Take a contact off the marketing list (they stay in Brevo's own unsubscribe list). */
  removeFromMarketing(email: string): Promise<void>;
  /** Delete the contact from Brevo altogether (privacy deletion). */
  deleteContact(email: string): Promise<void>;
  /** Emails that unsubscribed or were blocked since the given time. */
  unsubscribedSince(since: Date): Promise<string[]>;
}

const API = "https://api.brevo.com/v3";

async function call(path: string, init: RequestInit & { allow404?: boolean } = {}) {
  const key = env().BREVO_API_KEY!;
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 404 && init.allow404) return null;
  if (!r.ok) throw new Error(`Brevo HTTP ${r.status}`);
  return r.status === 204 ? null : ((await r.json().catch(() => null)) as unknown);
}

export function brevoClient(): BrevoClient {
  const e = env();
  const listId = e.BREVO_MARKETING_LIST_ID;
  if (!e.BREVO_API_KEY || !listId) {
    const noop = async () => {};
    return {
      connected: false,
      addToMarketing: noop,
      removeFromMarketing: noop,
      deleteContact: noop,
      unsubscribedSince: async () => [],
    };
  }
  return {
    connected: true,
    async addToMarketing(c) {
      const [first, ...rest] = c.name.trim().split(/\s+/);
      await call("/contacts", {
        method: "POST",
        body: JSON.stringify({
          email: c.email,
          attributes: { FIRSTNAME: first ?? "", LASTNAME: rest.join(" "), COMPANY: c.company },
          listIds: [listId],
          updateEnabled: true,
        }),
      });
    },
    async removeFromMarketing(email) {
      await call(`/contacts/lists/${listId}/contacts/remove`, {
        method: "POST",
        body: JSON.stringify({ emails: [email] }),
        allow404: true,
      });
    },
    async deleteContact(email) {
      await call(`/contacts/${encodeURIComponent(email)}`, { method: "DELETE", allow404: true });
    },
    async unsubscribedSince(since) {
      const out: string[] = [];
      for (let offset = 0; offset < 5000; offset += 500) {
        const page = (await call(
          `/contacts?limit=500&offset=${offset}&modifiedSince=${encodeURIComponent(since.toISOString())}`,
        )) as {
          contacts?: { email?: string; emailBlacklisted?: boolean; listUnsubscribed?: number[] }[];
        } | null;
        const contacts = page?.contacts ?? [];
        for (const c of contacts) {
          if (c.email && (c.emailBlacklisted || c.listUnsubscribed?.includes(listId)))
            out.push(c.email.toLowerCase());
        }
        if (contacts.length < 500) break;
      }
      return out;
    },
  };
}
