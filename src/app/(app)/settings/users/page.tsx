import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";
import { listUsers } from "@/server/users/service";
import { AddUserButton } from "./user-dialogs";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const actor = await requirePageUser("user.manage");
  const users = await listUsers(actor);

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who can sign in to Propfolio. Accounts are never deleted — turn them off instead."
        actions={<AddUserButton />}
      />
      <UsersTable
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
