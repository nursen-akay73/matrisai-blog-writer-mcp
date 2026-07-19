import type { Express } from "express";

export async function createApp(): Promise<Express> {
  const express = (await import("express")).default;
  const { createPipelineRouter } = await import("./routes/pipeline.routes.js");
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1", createPipelineRouter(express.Router));
  return app;
}
