import { requireActor } from "@/server/auth/current";
import { apiRoute, readJson } from "@/server/http";
import { metaFromHeaders } from "@/server/request-meta";
import { createUser, listUsers } from "@/server/users/service";

export const GET = apiRoute(async () => {
  const actor = await requireActor("user.manage");
  return { users: await listUsers(actor) };
});

export const POST = apiRoute(async (req) => {
  const actor = await requireActor("user.manage");
  const result = await createUser(actor, await readJson(req), metaFromHeaders(req.headers));
  return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
});
