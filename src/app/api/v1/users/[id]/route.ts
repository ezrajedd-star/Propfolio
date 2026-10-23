import { requireActor } from "@/server/auth/current";
import { apiRoute, readJson } from "@/server/http";
import { metaFromHeaders } from "@/server/request-meta";
import { getUser, updateUser } from "@/server/users/service";

type Params = { id: string };

export const GET = apiRoute<Params>(async (_req, { params }) => {
  const actor = await requireActor("user.manage");
  return { user: await getUser(actor, (await params).id) };
});

export const PATCH = apiRoute<Params>(async (req, { params }) => {
  const actor = await requireActor("user.manage");
  const user = await updateUser(
    actor,
    (await params).id,
    await readJson(req),
    metaFromHeaders(req.headers),
  );
  return { user };
});
