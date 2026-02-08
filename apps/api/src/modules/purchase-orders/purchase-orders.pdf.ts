type PurchaseOrderPdfLine = {
  description: string;
  qtyOrdered: string | number;
  unitPrice: string | number;
  lineTotal: string | number;
};

type PurchaseOrderPdfInput = {
  orgName?: string | null;
  poNumber: string;
  poDate: Date;
  expectedDeliveryDate?: Date | null;
  vendorName: string;
  vendorEmail?: string | null;
  currency: string;
  subTotal: string | number;
  taxTotal: string | number;
  total: string | number;
  reference?: string | null;
  notes?: string | null;
  lines: PurchaseOrderPdfLine[];
};

const escapePdfText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const formatDate = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : "-");

const truncate = (value: string, max = 96) => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}...`;
};

const toPrintableMoney = (value: string | number, currency: string) => `${currency} ${value}`;

export const buildPurchaseOrderPdf = (input: PurchaseOrderPdfInput): Buffer => {
  const lines: string[] = [
    "LedgerLite Purchase Order",
    input.orgName ? `Organization: ${input.orgName}` : "Organization: -",
    "",
    `PO Number: ${input.poNumber}`,
    `PO Date: ${formatDate(input.poDate)}`,
    `Expected Delivery: ${formatDate(input.expectedDeliveryDate)}`,
    "",
    `Vendor: ${input.vendorName}`,
    `Vendor Email: ${input.vendorEmail ?? "-"}`,
    input.reference ? `Reference: ${input.reference}` : "Reference: -",
    "",
    "Line Items",
  ];

  if (input.lines.length === 0) {
    lines.push("No line items.");
  } else {
    input.lines.forEach((line, index) => {
      lines.push(
        truncate(
          `${index + 1}. ${line.description} | Qty: ${line.qtyOrdered} | Unit: ${toPrintableMoney(line.unitPrice, input.currency)} | Total: ${toPrintableMoney(line.lineTotal, input.currency)}`,
        ),
      );
    });
  }

  lines.push("");
  lines.push(`Subtotal: ${toPrintableMoney(input.subTotal, input.currency)}`);
  lines.push(`Tax: ${toPrintableMoney(input.taxTotal, input.currency)}`);
  lines.push(`Total: ${toPrintableMoney(input.total, input.currency)}`);
  lines.push("");
  lines.push(input.notes ? `Notes: ${truncate(input.notes, 120)}` : "Notes: -");

  const streamLines = lines.slice(0, 46);
  const startY = 800;
  const lineHeight = 16;
  const textCommands = ["BT", "/F1 11 Tf"];
  for (let i = 0; i < streamLines.length; i += 1) {
    const y = startY - i * lineHeight;
    textCommands.push(`1 0 0 1 40 ${y} Tm (${escapePdfText(streamLines[i])}) Tj`);
  }
  textCommands.push("ET");
  const contentStream = textCommands.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
};

