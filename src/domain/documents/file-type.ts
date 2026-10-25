/**
 * Allowed document types, checked by the file's first bytes (not its name or the browser's
 * claimed type), so a renamed program can't be uploaded as a "PDF".
 */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_TYPES = {
  pdf: { contentType: "application/pdf", label: "PDF" },
  jpg: { contentType: "image/jpeg", label: "JPG" },
  png: { contentType: "image/png", label: "PNG" },
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word (DOCX)",
  },
} as const;
export type DocumentExt = keyof typeof DOCUMENT_TYPES;

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.docx";

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

/** A DOCX is a ZIP whose entries include `word/` and `[Content_Types].xml`. */
function looksLikeDocx(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
  const text = new TextDecoder("latin1").decode(
    bytes.subarray(0, Math.min(bytes.length, 64 * 1024)),
  );
  return text.includes("[Content_Types].xml") && text.includes("word/");
}

export function detectDocumentType(bytes: Uint8Array): DocumentExt | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (looksLikeDocx(bytes)) return "docx";
  return null;
}

/** Keep a readable file name: no folders, control characters or quotes; at most 150 characters. */
export function cleanFileName(name: string, ext: DocumentExt): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const safe = (base || "document").slice(0, 140);
  return `${safe}.${ext}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
