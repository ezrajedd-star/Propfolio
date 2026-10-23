"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: "left" | "right" }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40" />
      <SheetPrimitive.Content
        className={cn(
          "bg-card data-[state=closed]:animate-out data-[state=open]:animate-in fixed inset-y-0 z-50 flex h-full w-[min(26rem,calc(100%-3rem))] flex-col gap-4 overflow-y-auto shadow-lg data-[state=closed]:duration-200 data-[state=open]:duration-300",
          side === "right"
            ? "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right right-0 border-l"
            : "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left left-0 border-r",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-md">
          <XIcon className="size-5" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-6 pb-0", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("text-xl font-semibold", className)} {...props} />;
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description className={cn("text-muted-foreground", className)} {...props} />
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription };
