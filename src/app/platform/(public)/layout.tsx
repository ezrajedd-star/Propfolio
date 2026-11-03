import { Logo } from "@/components/app/logo";

/** Sign-in and set-up pages of the platform admin (Propfolio staff only). */
export default function PlatformPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted/40 flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-1">
        <Logo className="text-xl" />
        <span className="text-muted-foreground font-medium">Platform admin</span>
      </div>
      <div className="bg-card w-full max-w-md rounded-2xl border p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}
