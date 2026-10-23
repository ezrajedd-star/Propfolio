import { can, type Permission, type Role } from "@/domain/auth/roles";
import { ForbiddenError } from "@/server/errors";

export interface Actor {
  id: string;
  name: string;
  email: string;
  role: Role;
  sessionId?: string;
}

export function assertCan(actor: { role: Role }, permission: Permission): void {
  if (!can(actor.role, permission)) throw new ForbiddenError();
}
