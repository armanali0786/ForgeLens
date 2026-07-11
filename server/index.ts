import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { router } from "./routes";
import { initSocket } from "./socket";
import { startSimulator } from "./simulator";

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";

const app = express();
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

const feedbackLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/anomalies/:id/feedback", feedbackLimiter);

app.use("/api", router);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
};
app.use(errorHandler);

const httpServer = createServer(app);
initSocket(httpServer, CLIENT_ORIGIN);

httpServer.listen(PORT, () => {
  console.log(`ForgeLens API listening on :${PORT}`);
  startSimulator().catch((err) => {
    console.error("[simulator] failed to start", err);
    process.exit(1);
  });
});
