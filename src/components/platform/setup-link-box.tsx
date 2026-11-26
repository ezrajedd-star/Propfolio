"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** A one-time set-up link, shown once, with a copy button. */
export function SetupLinkBox({ link, who }: { link: string; who: string }) {
  return (
    <div role="status" className="bg-card space-y-3 rounded-xl border-2 border-dashed p-4">
      <p className="font-medium">
        Send this link to {who}. It works once, for 24 hours, and won&apos;t be shown again.
      </p>
      <p className="bg-muted rounded p-2 font-mono text-sm break-all">{link}</p>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          navigator.clipboard
            .writeText(link)
            .then(() => toast.success("Link copied ✓"))
            .catch(() => toast.error("Couldn't copy. Select the link and copy it instead."))
        }
      >
        <Copy aria-hidden /> Copy link
      </Button>
    </div>
  );
}
