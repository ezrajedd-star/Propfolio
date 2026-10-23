"use client";

import { KeyRound, LockOpen, MoreHorizontal, Pencil, Power, PowerOff } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/app/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS } from "@/domain/auth/roles";
import { formatDateTime, formatTime } from "@/domain/time/manila";
import { sendPasswordResetAction, setUserActiveAction, unlockUserAction } from "./actions";
import type { UserRow } from "./types";
import { EditUserDialog } from "./user-dialogs";

function UserStatusBadge({ user }: { user: UserRow }) {
  switch (user.status) {
    case "inactive":
      return <StatusBadge tone="neutral" label="Turned off" />;
    case "locked":
      return (
        <StatusBadge
          tone="danger"
          label={`Locked until ${formatTime(new Date(user.lockedUntil!))}`}
        />
      );
    case "invited":
      return <StatusBadge tone="warning" label="Hasn't signed in yet" />;
    default:
      return <StatusBadge tone="success" label="Active" />;
  }
}

type Confirm = { kind: "reset" | "deactivate"; user: UserRow } | null;

export function UsersTable({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pending, startTransition] = useTransition();

  const run = (
    fn: () => Promise<{ ok: boolean; message?: string }>,
    success: string,
    undo?: () => Promise<{ ok: boolean; message?: string }>,
  ) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.message ?? "That didn't work. Please try again.");
        return;
      }
      toast.success(success, {
        duration: undo ? 8000 : undefined,
        action: undo ? { label: "Undo", onClick: () => run(undo, "Undone ✓") } : undefined,
      });
    });

  return (
    <>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last signed in</TableHead>
              <TableHead className="w-16">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <TableRow
                  key={user.id}
                  className={user.isActive ? undefined : "text-muted-foreground"}
                >
                  <TableCell>
                    <div className="text-foreground font-medium">
                      {user.name}
                      {isSelf ? (
                        <span className="text-muted-foreground ml-2 text-sm font-normal">
                          (you)
                        </span>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground text-sm">{user.email}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{ROLE_LABELS[user.role]}</TableCell>
                  <TableCell>
                    <UserStatusBadge user={user} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {user.lastLoginAt ? formatDateTime(new Date(user.lastLoginAt)) : "Never"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${user.name}`}
                          disabled={pending}
                        >
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(user)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        {user.isActive ? (
                          <DropdownMenuItem onSelect={() => setConfirm({ kind: "reset", user })}>
                            <KeyRound /> Reset password
                          </DropdownMenuItem>
                        ) : null}
                        {user.status === "locked" ? (
                          <DropdownMenuItem
                            onSelect={() =>
                              run(() => unlockUserAction(user.id), `${user.name} is unlocked ✓`)
                            }
                          >
                            <LockOpen /> Unlock
                          </DropdownMenuItem>
                        ) : null}
                        {!isSelf ? (
                          <>
                            <DropdownMenuSeparator />
                            {user.isActive ? (
                              <DropdownMenuItem
                                destructive
                                onSelect={() => setConfirm({ kind: "deactivate", user })}
                              >
                                <PowerOff /> Turn off account
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onSelect={() =>
                                  run(
                                    () => setUserActiveAction(user.id, true),
                                    `${user.name} can sign in again ✓`,
                                  )
                                }
                              >
                                <Power /> Turn account back on
                              </DropdownMenuItem>
                            )}
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {editing ? (
        <EditUserDialog
          user={editing}
          isSelf={editing.id === currentUserId}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      ) : null}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          {confirm?.kind === "reset" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Email {confirm.user.name} a password link?</AlertDialogTitle>
                <AlertDialogDescription>
                  We&apos;ll email {confirm.user.email} a link to choose a new password. Their
                  current password keeps working until they use the link.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const user = confirm.user;
                    startTransition(async () => {
                      const result = await sendPasswordResetAction(user.id);
                      if (!result.ok) toast.error(result.message);
                      else if (result.data.sent)
                        toast.success(`Password link sent to ${user.email} ✓`);
                      else
                        toast.error(
                          "We couldn't send the email. Check the email settings, then try again.",
                        );
                    });
                  }}
                >
                  Send link
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : confirm?.kind === "deactivate" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Turn off {confirm.user.name}&apos;s account?</AlertDialogTitle>
                <AlertDialogDescription>
                  They will be signed out straight away and won&apos;t be able to sign in or receive
                  reminder emails. Their history stays. You can turn the account back on later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it on</AlertDialogCancel>
                <AlertDialogAction
                  destructive
                  onClick={() => {
                    const user = confirm.user;
                    run(
                      () => setUserActiveAction(user.id, false),
                      `${user.name}'s account is turned off`,
                      () => setUserActiveAction(user.id, true),
                    );
                  }}
                >
                  Turn off account
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
