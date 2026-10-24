"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { NewTenantForm } from "@/components/app/new-tenant-form";

export function NewTenantPageForm({ privacyNotice }: { privacyNotice: string }) {
  const router = useRouter();
  return (
    <NewTenantForm
      privacyNotice={privacyNotice}
      onCancel={() => router.push("/tenants")}
      onCreated={(t) => {
        toast.success(`${t.displayName} added ✓`);
        router.push(`/tenants/${t.id}`);
      }}
    />
  );
}
