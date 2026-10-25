import { describe, expect, it } from "vitest";

import { cleanFileName, detectDocumentType, formatFileSize } from "./file-type";

const bytes = (...b: number[]) => new Uint8Array(b);
const zipWith = (text: string) =>
  new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode(text)]);

describe("detectDocumentType", () => {
  it.each([
    ["PDF", new TextEncoder().encode("%PDF-1.7\n..."), "pdf"],
    ["JPG", bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10), "jpg"],
    ["PNG", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), "png"],
    ["DOCX", zipWith("[Content_Types].xml ... word/document.xml"), "docx"],
    ["plain ZIP", zipWith("photos/a.jpg"), null],
    ["Windows program", bytes(0x4d, 0x5a, 0x90, 0), null],
    ["HTML", new TextEncoder().encode("<html><script>"), null],
    ["empty", bytes(), null],
  ] as const)("%s → %s", (_, input, expected) => {
    expect(detectDocumentType(input)).toBe(expected);
  });
});

describe("cleanFileName", () => {
  it.each([
    ["Lease contract.pdf", "pdf", "Lease contract.pdf"],
    ["C:\\Users\\ana\\scan.JPG", "jpg", "scan.jpg"],
    ["../../etc/passwd", "pdf", "passwd.pdf"],
    ['bad"name<>.pdf', "pdf", "badname.pdf"],
    ["renamed.exe", "pdf", "renamed.pdf"],
    ["", "png", "document.png"],
    ["a".repeat(300) + ".pdf", "pdf", "a".repeat(140) + ".pdf"],
  ] as const)("%s", (input, ext, expected) => {
    expect(cleanFileName(input, ext)).toBe(expected);
  });
});

describe("formatFileSize", () => {
  it.each([
    [500, "500 bytes"],
    [2048, "2 KB"],
    [5 * 1024 * 1024, "5.0 MB"],
  ])("%d → %s", (n, s) => expect(formatFileSize(n)).toBe(s));
});
