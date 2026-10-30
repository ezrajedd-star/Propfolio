"use client";

import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

/** Shown if a page fails unexpectedly. No technical details are shown or logged here. */
export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Something went wrong on our side"
      action={
        <Button onClick={reset} type="button">
          Try again
        </Button>
      }
    >
      Your work up to the last save is safe. Please try again. If it keeps happening, tell your
      Admin which page you were on.
    </EmptyState>
  );
}
