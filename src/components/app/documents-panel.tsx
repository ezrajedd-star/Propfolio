"use client";

import { FileText, FileUp, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/app/empty-state";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { FormAlert } from "@/components/form/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { archiveDocumentAction } from "@/app/(app)/documents/actions";
import { ACCEPT_ATTRIBUTE, formatFileSize, MAX_DOCUMENT_BYTES } from "@/domain/documents/file-type";
import { formatDateTime } from "@/domain/time/manila";

export interface DocumentItem {
  id: string;
  categoryLabel: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string | null;
  leaseRefNo: string | null;
}

const CATEGORIES = [
  ["SIGNED_CONTRACT", "Signed contract"],
  ["AMENDMENT", "Amendment"],
  ["ID", "ID"],
  ["OTHER", "Other"],
] as const;

/** Upload, open and remove documents for a lease or a tenant. */
export function DocumentsPanel({
  target,
  documents,
  canUpload,
  showLease = false,
}: {
  target: { leaseId: string } | { tenantId: string };
  documents: DocumentItem[];
  canUpload: boolean;
  showLease?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>("SIGNED_CONTRACT");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<DocumentItem | null>(null);

  const choose = (f: File | null) => {
    setError(null);
    if (f && f.size > MAX_DOCUMENT_BYTES) {
      setError("This file is larger than 20 MB. Please scan it at a lower resolution or split it.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("category", category);
      for (const [k, v] of Object.entries(target)) body.set(k, v);
      const res = await fetch("/api/v1/documents", { method: "POST", body });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: { message?: string; fieldErrors?: Record<string, string> };
        } | null;
        setError(
          j?.error?.fieldErrors?.file ??
            j?.error?.message ??
            "The upload didn't work. Please try again.",
        );
        return;
      }
      toast.success("Document uploaded ✓");
      setFile(null);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch {
      setError("The upload didn't work. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {canUpload ? (
        <Card data-guide="documents-upload">
          <CardHeader>
            <CardTitle>Upload a document</CardTitle>
            <p className="text-muted-foreground">PDF, JPG, PNG or Word (DOCX), up to 20 MB.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? <FormAlert>{error}</FormAlert> : null}
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="doc-file">File</Label>
                <label
                  htmlFor="doc-file"
                  className="hover:bg-muted/50 flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    choose(e.dataTransfer.files[0] ?? null);
                  }}
                >
                  <FileUp className="text-primary size-6" aria-hidden />
                  {file ? (
                    <span className="font-medium">
                      {file.name} ({formatFileSize(file.size)})
                    </span>
                  ) : (
                    <span>Click to choose a file, or drop it here</span>
                  )}
                </label>
                <input
                  ref={input}
                  id="doc-file"
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  className="sr-only"
                  onChange={(e) => choose(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-category">What is it?</Label>
                <NativeSelect
                  id="doc-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <Button onClick={upload} disabled={uploading}>
              {uploading ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <FileUp aria-hidden />
              )}
              Upload document
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {documents.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <p className="text-muted-foreground">
              Opening a document is recorded in the audit log. Links work for 5 minutes.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                  {d.contentType.startsWith("image/") ? (
                    <ImageIcon className="text-muted-foreground size-6" aria-hidden />
                  ) : (
                    <FileText className="text-muted-foreground size-6" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-all">{d.fileName}</p>
                    <p className="text-muted-foreground text-sm">
                      {formatFileSize(d.sizeBytes)} · {formatDateTime(new Date(d.uploadedAt))}
                      {d.uploadedBy ? ` · ${d.uploadedBy}` : ""}
                      {showLease && d.leaseRefNo ? ` · ${d.leaseRefNo}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline">{d.categoryLabel}</Badge>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`/api/v1/documents/${d.id}/link`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${d.fileName}`}
                    >
                      Open
                    </a>
                  </Button>
                  {canUpload ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoving(d)}
                      aria-label={`Remove ${d.fileName}`}
                    >
                      <Trash2 aria-hidden /> Remove
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={FileText} title="No documents yet">
          {canUpload
            ? "Upload the signed contract, amendments or IDs above."
            : "Documents uploaded by the Leasing team will show here."}
        </EmptyState>
      )}

      <ReasonDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this document?"
        description={`"${removing?.fileName ?? ""}" will be hidden from this list. It stays on record for Admins, with your reason.`}
        confirmLabel="Remove document"
        done="Document removed"
        onConfirm={async (reason) => {
          const r = await archiveDocumentAction(removing!.id, reason);
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </div>
  );
}
