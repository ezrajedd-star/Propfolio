"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{ classNames: { toast: "text-base! rounded-lg!" } }}
      {...props}
    />
  );
}

export { Toaster };
