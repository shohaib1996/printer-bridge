import dotenv from "dotenv";
import path from "path";

// __dirname = dist/ folder, so ../ = project root — works regardless of where node is launched from
const ROOT = path.join(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

import express from "express";
import cors from "cors";
import fs from "fs";
import printRoutes from "./routes/print.routes";

const configPath = path.join(ROOT, "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = express();
const PORT: number = config.port ?? 5050;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

// ── API Key Auth (skip for /health) ──────────────────────────────────────────

app.use((req, res, next) => {
  if (req.path === "/health") return next();
  const key = req.headers["x-pps-print-key"];
  if (!key || key !== process.env.PPS_PRINT_KEY) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use("/", printRoutes);

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "pps-print-bridge",
    version: "1.0.0",
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[print-bridge] Running on http://0.0.0.0:${PORT}`);
  console.log(`[print-bridge] API key protection: enabled`);
  console.log(`[print-bridge] Config loaded from: ${configPath}`);
  if (process.env.DRY_RUN === "true") {
    console.log(`[print-bridge] *** DRY RUN MODE — no real printing, PDFs saved to /preview/ ***`);
  }
});
