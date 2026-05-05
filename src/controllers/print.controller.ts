import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { renderLabel } from "../services/labelRenderer";
import { printPdf, getInstalledPrinters } from "../services/printerService";
import { logPrintJob } from "../services/logger";

// ── Load config ───────────────────────────────────────────────────────────────

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "config.json"), "utf-8")
);

function getPrinterName(printerKey: string): string | null {
  return config.printers[printerKey] ?? null;
}

function getLabelSize(labelType: string): { width: string; height: string } {
  return config.labelSizes[labelType] ?? { width: "4in", height: "2in" };
}

// ── GET /printers ─────────────────────────────────────────────────────────────

export async function listPrinters(_req: Request, res: Response) {
  try {
    const printers = await getInstalledPrinters();
    res.json({ printers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ── POST /print/test ──────────────────────────────────────────────────────────

export async function testPrint(req: Request, res: Response) {
  const { printerKey } = req.body;

  if (!printerKey) {
    res.status(400).json({ success: false, error: "printerKey is required" });
    return;
  }

  const printerName = getPrinterName(printerKey);
  if (!printerName) {
    res.status(400).json({
      success: false,
      error: `Printer key "${printerKey}" not found in config`,
    });
    return;
  }

  const jobId = `PRINT-TEST-${Date.now()}`;

  try {
    const labelSize = getLabelSize(printerKey);
    const testData = {
      storeName: "TEST STORE",
      flavor: "Test Flavor",
      quantity: 100,
      cookItemId: "TEST-ITEM-001",
      orderId: "TEST-ORDER-001",
      productType: "BIOMAX",
      baggingStartTimestamp: new Date().toISOString(),
    };

    const pdfPath = await renderLabel(printerKey, testData, labelSize);
    await printPdf(pdfPath, printerName);
    fs.unlinkSync(pdfPath);

    await logPrintJob({
      jobId,
      printerKey,
      printerName,
      labelType: printerKey,
      copies: 1,
      status: "success",
      error: null,
      dataSummary: { note: "test print" },
    });

    res.json({
      success: true,
      message: `Test label sent to ${printerName}`,
    });
  } catch (err: any) {
    await logPrintJob({
      jobId,
      printerKey,
      printerName,
      labelType: printerKey,
      copies: 1,
      status: "error",
      error: err.message,
      dataSummary: { note: "test print" },
    });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ── POST /print ───────────────────────────────────────────────────────────────

export async function print(req: Request, res: Response) {
  const { printerKey, labelType, copies = 1, data } = req.body;

  // ── Validate ─────────────────────────────────────────────────────────────

  if (!printerKey || !labelType || !data) {
    res.status(400).json({
      success: false,
      error: "printerKey, labelType, and data are required",
    });
    return;
  }

  const printerName = getPrinterName(printerKey);
  if (!printerName) {
    res.status(400).json({
      success: false,
      error: `Printer key "${printerKey}" not configured`,
      printerKey,
    });
    return;
  }

  const jobId = `PRINT-${Date.now()}-${uuidv4().substring(0, 6).toUpperCase()}`;
  const labelSize = getLabelSize(labelType);

  // ── Render + Print ────────────────────────────────────────────────────────

  let pdfPath: string | null = null;
  try {
    pdfPath = await renderLabel(labelType, data, labelSize);

    for (let i = 0; i < copies; i++) {
      await printPdf(pdfPath, printerName);
    }

    if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

    await logPrintJob({
      jobId,
      printerKey,
      printerName,
      labelType,
      copies,
      status: "success",
      error: null,
      dataSummary: {
        orderId: data.orderId,
        cookItemId: data.cookItemId,
        storeName: data.storeName,
        caseId: data.caseId,
      },
    });

    res.json({
      success: true,
      jobId,
      printer: printerName,
      message: "Print job sent",
    });
  } catch (err: any) {
    if (pdfPath && fs.existsSync(pdfPath)) {
      try { fs.unlinkSync(pdfPath); } catch {}
    }

    await logPrintJob({
      jobId,
      printerKey,
      printerName,
      labelType,
      copies,
      status: "error",
      error: err.message,
      dataSummary: {
        orderId: data.orderId,
        cookItemId: data.cookItemId,
        storeName: data.storeName,
      },
    });

    const errMsg: string = err.message ?? "";
    if (errMsg.includes("not found") || errMsg.includes("cannot find")) {
      res.status(404).json({
        success: false,
        error: "Printer not found — check config.json printer name matches Windows",
        printerKey,
        expectedPrinter: printerName,
      });
    } else {
      res.status(500).json({
        success: false,
        error: errMsg || "Print job failed",
        printerKey,
        expectedPrinter: printerName,
      });
    }
  }
}
