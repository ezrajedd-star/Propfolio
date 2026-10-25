import { AppShell } from "@/components/app/app-shell";
import { requirePageUser } from "@/server/auth/current";
import { env } from "@/server/env";
import { getGuideState } from "@/server/preferences";

// Every page here depends on who is signed in.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const guide = await getGuideState(user);
  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      options={{ guide, uat: env().UAT_MODE }}
    >
      {children}
    </AppShell>
  );
}
