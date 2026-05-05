import fs from "fs";
import path from "path";

const LOGS_DIR = path.join(__dirname, "..", "..", "logs");
const LOG_FILE = path.join(LOGS_DIR, "print-jobs.jsonl");

export interface PrintJobLog {
  jobId: string;
  printerKey: string;
  printerName: string;
  labelType: string;
  copies: number;
  status: "success" | "error";
  error: string | null;
  dataSummary: Record<string, any>;
}

export async function logPrintJob(entry: PrintJobLog): Promise<void> {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    const line = JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    });

    fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
  } catch {
    // Non-critical — never let logging failure break a print job
  }
}
