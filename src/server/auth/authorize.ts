import { can, type Permission, type Role } from "@/domain/auth/roles";
import { ForbiddenError } from "@/server/errors";

export interface Actor {
  id: string;
  name: string;
  email: string;
  /** The person's role in `accountId`. */
  role: Role;
  /** The account this person is working in. Every query is limited to it. */
  accountId: string;
  sessionId?: string;
}

export function assertCan(actor: { role: Role }, permission: Permission): void {
  if (!can(actor.role, permission)) throw new ForbiddenError();
}
