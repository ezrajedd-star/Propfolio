"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/actions";

/** A button that asks "are you sure?" before running a server action. */
export function ConfirmButton<T>({
  label,
  title,
  description,
  confirmLabel,
  done,
  variant = "outline",
  icon,
  onConfirm,
  onDone,
}: {
  label: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  done: string | null;
  variant?: "outline" | "destructive" | "default" | "ghost";
  icon?: ReactNode;
  onConfirm: () => Promise<ActionResult<T>>;
  onDone?: (data: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        {icon}
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant={variant === "destructive" ? "destructive" : "default"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await onConfirm();
                  if (r.ok) {
                    if (done) toast.success(done);
                    setOpen(false);
                    onDone?.(r.data);
                  } else {
                    toast.error(r.message);
                  }
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
