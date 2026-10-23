import type { Role } from "@/domain/auth/roles";
import type { UserStatus } from "@/server/users/service";

/** A user as sent to the browser (dates as ISO strings). */
export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  status: UserStatus;
  lastLoginAt: string | null;
  lockedUntil: string | null;
}
