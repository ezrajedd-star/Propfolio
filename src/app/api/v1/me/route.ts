import { permissionsFor } from "@/domain/auth/roles";
import { requireActor } from "@/server/auth/current";
import { apiRoute } from "@/server/http";

export const GET = apiRoute(async () => {
  const actor = await requireActor();
  return {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
    permissions: permissionsFor(actor.role),
  };
});
