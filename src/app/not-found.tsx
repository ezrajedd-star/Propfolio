import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-muted-foreground max-w-md">The link may be incomplete or out of date.</p>
      <Link href="/" className="text-primary font-medium underline">
        Go to Propfolio
      </Link>
    </main>
  );
}
