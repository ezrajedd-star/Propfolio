import { beforeEach, describe, expect, it } from "vitest";

import { validateSessionToken } from "@/server/auth/session";
import { asSystem, db } from "@/server/db";
import { ConflictError, ForbiddenError, PlanLimitError, ValidationError } from "@/server/errors";
import type { OutgoingMail } from "@/server/mail/transport";
import {
  acceptInvitationNewPerson,
  acceptInvitationSignedIn,
  acceptInvitationWithGoogle,
  getInvitation,
  getTeam,
  inviteMember,
  revokeInvitation,
  transferOwnership,
  type TeamDeps,
} from "@/server/team/service";
import { TEST_ACCOUNT_ID, makeAccount, makeUser, meta, refreshAccess, resetDb } from "./helpers";

beforeEach(resetDb);

const T0 = new Date("2026-11-08T02:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

function mailbox() {
  const sent: OutgoingMail[] = [];
  const deps: TeamDeps = { send: async (m) => void sent.push(m) };
  return { sent, deps };
}
const tokenOf = (link: string) => link.split("/invite/")[1]!;
const join = { name: "Nina New", password: "a long sunny afternoon", acceptLegal: true };

describe("invitations", () => {
  it("someone new joins with their own password and lands in the team's account", async () => {
    const owner = await makeUser("OWNER", { name: "Olga Owner" });
    const mail = mailbox();
    const { link } = await inviteMember(
      owner,
      { email: "Nina@Example.test", role: "LEASING_STAFF" },
      meta,
      T0,
      mail.deps,
    );
    expect(mail.sent[0]!.to).toEqual(["nina@example.test"]);
    expect(mail.sent[0]!.subject).toBe("Olga Owner invited you to Test Leasing Co. on Propfolio");
    expect(await getInvitation(tokenOf(link), T0)).toMatchObject({
      ok: true,
      role: "LEASING_STAFF",
      email: "nina@example.test",
      hasAccount: false,
    });

    const session = await acceptInvitationNewPerson(tokenOf(link), join, meta, days(1));
    const s = await validateSessionToken(session.token, days(1));
    expect(s).toMatchObject({
      accountId: TEST_ACCOUNT_ID,
      user: { role: "LEASING_STAFF", legalToAccept: [] },
    });
    // Used once.
    await expect(
      acceptInvitationNewPerson(tokenOf(link), join, meta, days(1)),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await getInvitation(tokenOf(link), days(1))).toEqual({ ok: false, reason: "used" });
  });

  it("links expire after 7 days", async () => {
    const owner = await makeUser("OWNER");
    const { link } = await inviteMember(
      owner,
      { email: "late@example.test", role: "VIEWER" },
      meta,
      T0,
      mailbox().deps,
    );
    expect(await getInvitation(tokenOf(link), days(7))).toEqual({ ok: false, reason: "expired" });
    await expect(
      acceptInvitationNewPerson(tokenOf(link), join, meta, days(8)),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("someone with a Propfolio sign-in elsewhere joins too (one person, two accounts)", async () => {
    const owner = await makeUser("OWNER");
    const otherAccount = await makeAccount("Other Co");
    const accountant = await makeUser("ADMIN", {
      email: "acct@example.test",
      accountId: otherAccount,
    });
    const { link } = await inviteMember(
      owner,
      { email: "acct@example.test", role: "VIEWER" },
      meta,
      T0,
      mailbox().deps,
    );
    expect(await getInvitation(tokenOf(link), T0)).toMatchObject({ ok: true, hasAccount: true });
    // Signed in as someone else: refused.
    await expect(
      acceptInvitationSignedIn(tokenOf(link), { id: owner.id, email: owner.email }, meta, T0),
    ).rejects.toBeInstanceOf(ValidationError);
    const session = await acceptInvitationSignedIn(tokenOf(link), accountant, meta, T0);
    expect((await validateSessionToken(session.token, T0))?.accountId).toBe(TEST_ACCOUNT_ID);
    expect(await asSystem(() => db.membership.count({ where: { userId: accountant.id } }))).toBe(2);
  });

  it("someone new can join with Google (the invited email only)", async () => {
    const owner = await makeUser("OWNER");
    const { link } = await inviteMember(
      owner,
      { email: "g@example.test", role: "ADMIN" },
      meta,
      T0,
      mailbox().deps,
    );
    await expect(
      acceptInvitationWithGoogle(
        tokenOf(link),
        { sub: "s1", email: "other@example.test", name: "X" },
        meta,
        T0,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const session = await acceptInvitationWithGoogle(
      tokenOf(link),
      { sub: "s1", email: "g@example.test", name: "Gina Google" },
      meta,
      T0,
    );
    expect((await validateSessionToken(session.token, T0))?.user).toMatchObject({
      role: "ADMIN",
      name: "Gina Google",
    });
  });

  it("seats: open invitations count; withdrawing one frees its seat", async () => {
    const owner = await makeUser("OWNER");
    for (let i = 0; i < 3; i++) await makeUser("LEASING_STAFF");
    const { link } = await inviteMember(
      owner,
      { email: "fifth@example.test", role: "VIEWER" },
      meta,
      T0,
      mailbox().deps,
    );
    expect((await getTeam(owner, T0)).seats).toEqual({ used: 5, limit: 5 });
    await expect(
      inviteMember(
        owner,
        { email: "sixth@example.test", role: "VIEWER" },
        meta,
        T0,
        mailbox().deps,
      ),
    ).rejects.toBeInstanceOf(PlanLimitError);

    const inv = await asSystem(() =>
      db.invitation.findFirstOrThrow({ where: { email: "fifth@example.test" } }),
    );
    await revokeInvitation(owner, inv.id, meta, T0);
    expect(await getInvitation(tokenOf(link), T0)).toEqual({ ok: false, reason: "used" });
    await expect(
      inviteMember(
        owner,
        { email: "sixth@example.test", role: "VIEWER" },
        meta,
        T0,
        mailbox().deps,
      ),
    ).resolves.toBeTruthy();
  });

  it("can't invite someone already on the team; inviting again replaces the old link", async () => {
    const owner = await makeUser("OWNER");
    const staff = await makeUser("LEASING_STAFF");
    await expect(
      inviteMember(owner, { email: staff.email, role: "VIEWER" }, meta, T0, mailbox().deps),
    ).rejects.toBeInstanceOf(ValidationError);
    const first = await inviteMember(
      owner,
      { email: "x@example.test", role: "VIEWER" },
      meta,
      T0,
      mailbox().deps,
    );
    const second = await inviteMember(
      owner,
      { email: "x@example.test", role: "ADMIN" },
      meta,
      T0,
      mailbox().deps,
    );
    expect(await getInvitation(tokenOf(first.link), T0)).toEqual({ ok: false, reason: "used" });
    expect(await getInvitation(tokenOf(second.link), T0)).toMatchObject({
      ok: true,
      role: "ADMIN",
    });
  });

  it("teams are a Premium feature; Leasing Staff can't invite", async () => {
    const owner = await makeUser("OWNER");
    const staff = await makeUser("LEASING_STAFF");
    await expect(
      inviteMember(staff, { email: "x@example.test", role: "VIEWER" }, meta, T0, mailbox().deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await asSystem(() =>
      db.account.update({ where: { id: TEST_ACCOUNT_ID }, data: { plan: "PRO" } }),
    );
    await expect(
      inviteMember(
        await refreshAccess(owner),
        { email: "x@example.test", role: "VIEWER" },
        meta,
        T0,
        mailbox().deps,
      ),
    ).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("every team change is in the audit log", async () => {
    const owner = await makeUser("OWNER");
    const { link } = await inviteMember(
      owner,
      { email: "a@example.test", role: "VIEWER" },
      meta,
      T0,
      mailbox().deps,
    );
    await acceptInvitationNewPerson(tokenOf(link), join, meta, T0);
    const actions = (await asSystem(() => db.auditLog.findMany({ orderBy: { seq: "asc" } }))).map(
      (a) => a.action,
    );
    expect(actions).toEqual(expect.arrayContaining(["team.invite", "team.joined"]));
  });
});

describe("ownership", () => {
  it("the Owner hands the account to an Admin and becomes an Admin", async () => {
    const owner = await makeUser("OWNER");
    const admin = await makeUser("ADMIN");
    await transferOwnership(owner, admin.id, meta, T0);
    const roles = await asSystem(() =>
      db.membership.findMany({
        where: { accountId: TEST_ACCOUNT_ID },
        select: { userId: true, role: true },
      }),
    );
    expect(roles).toEqual(
      expect.arrayContaining([
        { userId: owner.id, role: "ADMIN" },
        { userId: admin.id, role: "OWNER" },
      ]),
    );
    expect(
      await asSystem(() => db.auditLog.count({ where: { action: "team.ownership_transferred" } })),
    ).toBe(1);
  });

  it("only to an active Admin, and only by the Owner", async () => {
    const owner = await makeUser("OWNER");
    const staff = await makeUser("LEASING_STAFF");
    const admin = await makeUser("ADMIN");
    await expect(transferOwnership(owner, staff.id, meta, T0)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(transferOwnership(admin, staff.id, meta, T0)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
