import { AppShell } from "@/components/app/app-shell";
import { requirePageUser } from "@/server/auth/current";
import { env } from "@/server/env";
import { getGuideState } from "@/server/preferences";
import { SupportBanner } from "@/components/app/support-banner";
import { canDo } from "@/server/auth/authorize";
import { getSupportAccess } from "@/server/support-access/service";

// Every page here depends on who is signed in.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const [guide, supportAccess] = await Promise.all([
    // Support mode never starts the welcome tour.
    user.support ? { on: false, tourDone: true, toursDone: [] } : getGuideState(user),
    user.support ? null : getSupportAccess(user),
  ]);
  const banner = user.support ? (
    <SupportBanner mode="staff" until={user.support.accessEndsAt} staffName={user.name} />
  ) : supportAccess ? (
    <SupportBanner
      mode="customer"
      until={supportAccess.expiresAt}
      canTurnOff={canDo(user, "settings.manage")}
    />
  ) : null;
  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      plan={{
        plan: user.access.plan,
        readOnly: user.access.readOnly,
        trialDaysLeft: user.access.trial?.daysLeft ?? null,
      }}
      options={{ guide, uat: env().UAT_MODE, banner, supportMode: Boolean(user.support) }}
    >
      {children}
    </AppShell>
  );
}
