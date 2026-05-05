import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

// process.cwd() = project root regardless of ts-node or compiled dist
const PREVIEW_DIR = path.join(process.cwd(), "preview");

// ── Get installed Windows printers ────────────────────────────────────────────

export async function getInstalledPrinters(): Promise<string[]> {
  if (process.env.DRY_RUN === "true") {
    return ["[DRY RUN] Microsoft Print to PDF", "[DRY RUN] No real printers queried"];
  }
  const { stdout } = await execAsync(
    `powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"`
  );
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// ── Silent print via Windows — no dialog ─────────────────────────────────────

export async function printPdf(pdfPath: string, printerName: string): Promise<void> {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  // DRY RUN: copy PDF to /preview/ folder so you can open and inspect it
  if (process.env.DRY_RUN === "true") {
    if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    const previewName = `label-preview-${Date.now()}.pdf`;
    const previewPath = path.join(PREVIEW_DIR, previewName);
    fs.copyFileSync(pdfPath, previewPath);
    console.log(`[DRY RUN] Skipped real print to "${printerName}"`);
    console.log(`[DRY RUN] PDF saved → ${previewPath}`);
    return;
  }

  // ── Real print ────────────────────────────────────────────────────────────

  const safePdfPath = pdfPath.replace(/'/g, "''");
  const safePrinterName = printerName.replace(/'/g, "''");

  const psCommand = `
    $printerName = '${safePrinterName}'
    $pdfPath = '${safePdfPath}'

    $printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
    if (-not $printer) {
      throw "Printer '$printerName' not found. Check config.json printer name."
    }

    $shell = New-Object -ComObject Shell.Application
    $folder = $shell.NameSpace((Split-Path $pdfPath))
    $file = $folder.ParseName((Split-Path $pdfPath -Leaf))

    $currentDefault = (Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default=$true").Name
    (New-Object -ComObject WScript.Shell).RegWrite("HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows\\Device", "$printerName,winspool,Ne00:", "REG_SZ")

    $file.InvokeVerb('print')
    Start-Sleep -Seconds 3

    if ($currentDefault) {
      (New-Object -ComObject WScript.Shell).RegWrite("HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows\\Device", "$currentDefault,winspool,Ne00:", "REG_SZ")
    }
  `.trim();

  try {
    await execAsync(`powershell -NoProfile -NonInteractive -Command "${psCommand.replace(/"/g, '\\"')}"`);
  } catch (err: any) {
    const msg: string = err.stderr ?? err.message ?? "";
    if (msg.includes("not found") || msg.includes("cannot find")) {
      throw new Error(`Printer "${printerName}" not found on this Windows PC. Update config.json with the correct printer name.`);
    }
    throw new Error(`Print failed: ${msg}`);
  }
}
