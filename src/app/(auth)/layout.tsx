import { Logo } from "@/components/app/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="from-primary-soft/60 to-background flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b px-4 py-10">
      <div className="mb-8">
        <Logo className="text-xl" />
      </div>
      <div className="bg-card w-full max-w-md rounded-2xl border p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}
