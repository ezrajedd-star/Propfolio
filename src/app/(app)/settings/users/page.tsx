import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";
import { listUsers } from "@/server/users/service";
import { getTeam } from "@/server/team/service";
import { InviteButton, PendingInvitations } from "./invite";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const actor = await requirePageUser("user.manage", { duringReadOnly: true });
  const [users, team] = await Promise.all([listUsers(actor), getTeam(actor)]);
  const full = team.seats.used >= team.seats.limit;

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone on your team. Removing someone turns their sign-in off; nothing is deleted."
        actions={<InviteButton full={full} />}
      />
      <p className="mb-6 font-medium" data-testid="seats">
        {team.seats.used} of {team.seats.limit} users
        <span className="text-muted-foreground font-normal">
          {" "}
          (invitations not yet used count too)
          {full ? ". Every seat is taken: turn someone off, or contact us for more." : "."}
        </span>
      </p>
      <PendingInvitations
        invitations={team.invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresOn: i.expiresAt.toISOString().slice(0, 10),
        }))}
      />
      <UsersTable
        isOwner={actor.role === "OWNER"}
        currentUserId={actor.id}
        users={users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          lockedUntil: u.lockedUntil?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
