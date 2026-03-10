import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import jobsRouter from "./routes/jobs";

dotenv.config();

const app = express();
const port = Number(process.env.API_PORT ?? 3001);

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/jobs", jobsRouter);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Internal server error";
  console.error("API error:", error);
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`Foreman API running on port ${port}`);
});