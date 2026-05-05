import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import os from "os";

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

// ── Load and populate an HTML template ───────────────────────────────────────

function populateTemplate(templateName: string, data: Record<string, any>): string {
  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.html`);
  let html = fs.readFileSync(templatePath, "utf-8");

  // Replace all {{KEY}} placeholders with data values
  for (const [key, value] of Object.entries(data)) {
    const safe = value !== null && value !== undefined ? String(value) : "";
    html = html.replaceAll(`{{${key}}}`, safe);
  }

  // Remove any remaining unfilled placeholders
  html = html.replace(/\{\{[^}]+\}\}/g, "");

  return html;
}

// ── Format helpers (mirrors PrintLabel.tsx) ───────────────────────────────────

function formatLabelDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function formatLabelTime(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ── Build flat template data from raw label data ──────────────────────────────

function buildTemplateData(labelType: string, data: Record<string, any>): Record<string, string> {
  if (labelType === "bagging_label") {
    const baggedAt = data.baggingStartTimestamp || data.createdAt || new Date().toISOString();
    const moldIds: string[] = data.assignedMoldIds ?? [];
    const trayIds: string[] = data.dehydratorTrayIds ?? [];
    const flavorComponents: { name: string; percentage: number }[] = data.flavorComponents ?? [];
    const colorComponents: { name: string; percentage: number }[] = data.colorComponents ?? [];

    return {
      storeName: data.storeName ?? "",
      flavor: data.flavor ?? "",
      quantity: String(data.quantity ?? data.expectedCount ?? ""),
      productType: (data.productType ?? "BIOMAX").toUpperCase(),
      cookItemId: data.cookItemId ?? "",
      orderId: data.orderId ?? "",
      baggedDate: formatLabelDate(baggedAt),
      baggedTime: formatLabelTime(baggedAt),
      moldList: moldIds.length > 0 ? `MOLD${moldIds.length > 1 ? "S" : ""}: ${moldIds.join(", ")}` : "",
      trayList: trayIds.length > 0 ? `TRAY${trayIds.length > 1 ? "S" : ""}: ${trayIds.join(", ")}` : "",
      flavorFormulation: flavorComponents.length > 0
        ? `FLAVOR FORM: ${flavorComponents.map((c) => `${c.name} ${c.percentage}%`).join(", ")}`
        : "",
      colorFormulation: colorComponents.length > 0
        ? `COLOR FORM: ${colorComponents.map((c) => `${c.name} ${c.percentage}%`).join(", ")}`
        : "",
    };
  }

  if (labelType === "case_label") {
    return {
      storeName: data.storeName ?? "",
      flavor: data.flavor ?? "",
      unitCount: String(data.unitCount ?? ""),
      caseId: data.caseId ?? "",
      cookItemId: data.cookItemId ?? "",
      orderId: data.orderId ?? "",
      qrData: JSON.stringify({ caseId: data.caseId, cookItemId: data.cookItemId }),
    };
  }

  // Generic fallback — pass all string values through
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
  );
}

// ── Main render function ──────────────────────────────────────────────────────

export async function renderLabel(
  labelType: string,
  data: Record<string, any>,
  labelSize: { width: string; height: string }
): Promise<string> {
  const templateData = buildTemplateData(labelType, data);
  const html = populateTemplate(labelType, templateData);

  console.log(`[renderer] Launching Puppeteer for "${labelType}"...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    console.log(`[renderer] Setting page content...`);

    await page.setContent(html, { waitUntil: "networkidle0" });

    const tmpPath = path.join(os.tmpdir(), `pps-label-${Date.now()}.pdf`);
    console.log(`[renderer] Generating PDF → ${tmpPath}`);

    await page.pdf({
      path: tmpPath,
      width: labelSize.width,
      height: labelSize.height,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    console.log(`[renderer] PDF generated successfully`);
    return tmpPath;
  } finally {
    await browser.close();
  }
}
