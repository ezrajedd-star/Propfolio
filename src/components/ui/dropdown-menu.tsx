"use client";

import * as React from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 z-50 min-w-48 overflow-hidden rounded-lg border p-1.5 shadow-md",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "focus:bg-muted [&_svg]:text-muted-foreground relative flex min-h-10 cursor-default items-center gap-2.5 rounded-md px-3 py-2 text-base outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4.5 [&_svg]:shrink-0",
        destructive && "text-destructive [&_svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("text-muted-foreground px-3 py-1.5 text-sm", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("bg-border -mx-1.5 my-1.5 h-px", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
};
