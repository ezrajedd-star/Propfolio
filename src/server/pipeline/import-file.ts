import ExcelJS from "exceljs";

import { IMPORT_COLUMNS, type ImportRow } from "@/domain/pipeline/pipeline";
import { ValidationError } from "@/server/errors";

/** Read a leads spreadsheet (.xlsx, or .csv) into rows keyed by the template's column names. */
export async function readLeadSheet(
  bytes: Uint8Array,
  fileName: string,
): Promise<Partial<ImportRow>[]> {
  if (bytes.length > 5 * 1024 * 1024) throw new ValidationError("The file is larger than 5 MB.");
  let table: string[][];
  if (/\.csv$/i.test(fileName)) {
    table = parseCsv(new TextDecoder().decode(bytes));
  } else if (/\.xlsx$/i.test(fileName)) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      );
    } catch {
      throw new ValidationError(
        "We couldn't read that file. Use the template (.xlsx) or a .csv file.",
      );
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new ValidationError("The spreadsheet is empty.");
    table = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= IMPORT_COLUMNS.length + 5; c++) {
        const v = row.getCell(c).value;
        cells.push(
          v instanceof Date
            ? v.toISOString().slice(0, 10)
            : typeof v === "object" && v !== null && "text" in v
              ? String((v as { text: unknown }).text)
              : v == null
                ? ""
                : String(v),
        );
      }
      table.push(cells);
    });
  } else {
    throw new ValidationError("Choose an .xlsx or .csv file.");
  }
  const [header, ...rows] = table;
  if (!header) throw new ValidationError("The spreadsheet is empty.");
  const index = header.map((h) => h.trim());
  if (!index.includes("Name")) {
    throw new ValidationError(
      "The first row must have the template's column names (Name, Company, …).",
    );
  }
  return rows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(index.map((h, i) => [h, r[i] ?? ""])) as Partial<ImportRow>);
}

/** A small CSV reader: commas, quotes ("…", with "" for a quote), CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** The import template, with the column names and one made-up example row. */
export async function leadTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.addRow([...IMPORT_COLUMNS]);
  ws.getRow(1).font = { bold: true };
  ws.addRow([
    "Juana Example",
    "Example Realty Inc.",
    "Lessor",
    "juana@example.com",
    "0917 000 0000",
    "Event",
    "New",
    "40",
    "Met at the PH property expo",
    "2026-12-01",
    "yes",
    "2026-11-20",
    "Event sign-up sheet",
  ]);
  ws.columns.forEach((c) => (c.width = 22));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
