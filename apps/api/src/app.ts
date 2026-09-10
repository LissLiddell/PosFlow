import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { env } from "./config.js";
import { HttpError } from "./lib/http.js";
import advancesRouter from "./routes/advances.js";
import authRouter from "./routes/auth.js";
import cashBundlesRouter from "./routes/cashBundles.js";
import catalogRouter from "./routes/catalog.js";
import financeRouter from "./routes/finance.js";
import reportsRouter from "./routes/reports.js";
import remittancesRouter from "./routes/remittances.js";
import salesRouter from "./routes/sales.js";
import settingsRouter from "./routes/settings.js";
import shiftsRouter from "./routes/shifts.js";

export const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: env.WEB_ORIGIN }));
app.use(express.json({ limit: "100kb" }));

app.use("/api/auth", authRouter);
app.use("/api/advances", advancesRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/shifts", shiftsRouter);
app.use("/api/sales", salesRouter);
app.use("/api/cash-bundles", cashBundlesRouter);
app.use("/api/finance", financeRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/remittances", remittancesRouter);
app.use("/api/settings", settingsRouter);

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "posflow-api" });
});

app.use((_request, response) => {
  response.status(404).json({ error: { code: "NOT_FOUND", message: "The requested resource was not found." } });
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
    return;
  }
  console.error(error);
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
};

app.use(errorHandler);
