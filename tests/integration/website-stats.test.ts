import { beforeEach, describe, expect, it } from "vitest";

import { encodeLanding, LANDING_COOKIE } from "@/domain/marketing/analytics";
import { createAccountWithOwner } from "@/server/accounts/create";
import { asSystem, db } from "@/server/db";
import type { PlatformActor } from "@/server/platform/auth";
import { metaFromHeaders } from "@/server/request-meta";
import { countWebsiteStat, websiteReport } from "@/server/website-stats/service";
import { resetDb } from "./helpers";

beforeEach(resetDb);

const admin: PlatformActor = {
  id: "0190f0a0-0000-7000-8000-000000000001",
  name: "A",
  email: "a@x.example",
  sessionId: "s",
};
const NOW = new Date("2026-11-18T02:00:00Z");

describe("website statistics", () => {
  it("adds up visits per page and source, and new accounts against where they landed", async () => {
    await countWebsiteStat("VISIT", "/", "Google", NOW);
    await countWebsiteStat("VISIT", "/", "Google", NOW);
    await countWebsiteStat("VISIT", "/pricing", "Facebook", NOW);

    const meta = metaFromHeaders(
      new Headers({
        cookie: `other=1; ${LANDING_COOKIE}=${encodeLanding("/pricing", "Facebook")}`,
        "user-agent": "x",
      }),
    );
    expect(meta.landing).toEqual({ path: "/pricing", source: "Facebook" });
    await createAccountWithOwner(
      {
        name: "Nina New",
        email: "nina@new.example",
        companyName: "Nina Leasing",
        passwordHash: null,
        googleSub: null,
      },
      meta,
      NOW,
    );

    const r = await websiteReport(admin, 7, NOW);
    expect(r).toMatchObject({ visits: 3, signups: 1 });
    expect(r.pages).toEqual([
      { path: "/", visits: 2, signups: 0 },
      { path: "/pricing", visits: 1, signups: 1 },
    ]);
    expect(r.sources[0]).toEqual({ source: "Google", visits: 2, signups: 0 });
    expect(r.daily).toHaveLength(7);
    expect(r.daily.at(-1)).toEqual({ day: "2026-11-18", visits: 3, signups: 1 });

    // Counts only: no row holds anything about a person.
    const rows = await asSystem(() => db.websiteStat.findMany());
    expect(JSON.stringify(rows)).not.toMatch(/nina|203\.0\.113/i);
  });

  it("a sign-up without the cookie still counts, as 'not known'", async () => {
    await createAccountWithOwner(
      {
        name: "Ola",
        email: "ola@x.example",
        companyName: "Ola",
        passwordHash: null,
        googleSub: null,
      },
      metaFromHeaders(new Headers()),
      NOW,
    );
    const r = await websiteReport(admin, 1, NOW);
    expect(r.pages).toEqual([{ path: "(not known)", visits: 0, signups: 1 }]);
  });

  it("customer work can't read the statistics", async () => {
    await expect(db.$transaction(async (tx) => tx.websiteStat.count())).rejects.toThrow(
      /permission denied/,
    );
  });
});
