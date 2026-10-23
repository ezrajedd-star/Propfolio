import "@fontsource-variable/inter";
import "./globals.css";

import type { Metadata, Viewport } from "next";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: { default: "Propfolio", template: "%s · Propfolio" },
  description: "Lease ledger for rental property companies",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0f766e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH">
      <body className="min-h-dvh">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
