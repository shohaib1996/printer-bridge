import { Router } from "express";
import {
  listPrinters,
  testPrint,
  print,
} from "../controllers/print.controller";

const router = Router();

// GET /printers — list all Windows-installed printers
router.get("/printers", listPrinters);

// POST /print/test — send a test label to a printer by key
router.post("/print/test", testPrint);

// POST /print — main print endpoint
router.post("/print", print);

export default router;
