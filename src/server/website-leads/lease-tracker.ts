import ExcelJS from "exceljs";

/**
 * The free "Excel lease tracker" offered on the website: a simple sheet with days left and a
 * status worked out by formulas. No customer data; the same for everyone.
 */
export async function leaseTrackerWorkbook(siteUrl: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Propfolio";
  const ws = wb.addWorksheet("Leases", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Building", key: "building", width: 22 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Tenant", key: "tenant", width: 26 },
    { header: "Lease starts", key: "start", width: 14, style: { numFmt: "dd mmm yyyy" } },
    { header: "Lease ends", key: "end", width: 14, style: { numFmt: "dd mmm yyyy" } },
    { header: "Monthly rent (₱)", key: "rent", width: 18, style: { numFmt: "#,##0.00" } },
    { header: "Yearly increase (%)", key: "increase", width: 18 },
    { header: "Deposit (₱)", key: "deposit", width: 16, style: { numFmt: "#,##0.00" } },
    { header: "Days left", key: "days", width: 12 },
    { header: "What to do", key: "status", width: 24 },
  ];
  ws.getRow(1).font = { bold: true };
  const examples = [
    [
      "Sample Tower",
      "1203",
      "Sample Trading Corp.",
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2027, 11, 31)),
      50000,
      5,
      100000,
    ],
    [
      "Sample Homes",
      "2B",
      "Juan dela Cruz",
      new Date(Date.UTC(2026, 5, 1)),
      new Date(Date.UTC(2027, 4, 31)),
      12500,
      0,
      25000,
    ],
  ];
  for (let i = 0; i < 200; i++) {
    const r = i + 2;
    const row = ws.getRow(r);
    const ex = examples[i];
    if (ex) ex.forEach((v, c) => (row.getCell(c + 1).value = v as ExcelJS.CellValue));
    row.getCell(9).value = { formula: `IF(E${r}="","",E${r}-TODAY())` };
    row.getCell(10).value = {
      formula: `IF(I${r}="","",IF(I${r}<0,"Ended",IF(I${r}<=30,"Act now",IF(I${r}<=90,"Talk to the tenant","Fine for now"))))`,
    };
  }
  ws.addConditionalFormatting({
    ref: "J2:J201",
    rules: [
      {
        type: "containsText",
        operator: "containsText",
        text: "Act now",
        priority: 1,
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFDE2E1" } } },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "Talk to the tenant",
        priority: 2,
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFEF3C7" } } },
      },
    ],
  });

  const readMe = wb.addWorksheet("Read me");
  readMe.columns = [{ width: 100 }];
  [
    "Lease tracker, from Propfolio",
    "",
    "1. On the Leases sheet, replace the two sample rows with your own leases: one row per lease.",
    "2. 'Days left' and 'What to do' fill in by themselves from the end date.",
    "3. Sort by 'Days left' every week, and call the tenants marked 'Talk to the tenant'.",
    "",
    "A spreadsheet can't remind you. Propfolio emails your team before every lease ends,",
    "works out escalations to the centavo and keeps a record of every change.",
    `Start free, for up to 3 units: ${siteUrl}/signup`,
  ].forEach((l, i) => (readMe.getCell(i + 1, 1).value = l));
  readMe.getRow(1).font = { bold: true, size: 14 };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
