/** Policies read best as a narrow column. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-12">{children}</div>;
}
