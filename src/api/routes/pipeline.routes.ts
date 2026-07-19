import type { Request, Response, Router } from "express";

import { createLogger } from "../../autonomous/services/logger.js";
import type { TriggerPayload } from "../../autonomous/types.js";

const log = createLogger("pipeline-routes");

/** Express.Router factory dışarıdan verilir — bundle boot'ta express yüklemesin */
export function createPipelineRouter(Router: new () => Router): Router {
  const router = new Router();

  router.post("/trigger-pipeline", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as TriggerPayload;
    log.info("HTTP trigger alındı", {
      source: body.source ?? "anonymous",
      force: body.force,
    });

    try {
      const { runAutonomousPipeline } = await import(
        "../../autonomous/autonomous-orchestrator.js"
      );
      const result = await runAutonomousPipeline("http", {
        ...body,
        force: body.force !== false,
      });
      res.status(result.ok ? 200 : 500).json(result);
    } catch (err) {
      log.error("HTTP trigger hata", {
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "autonomous-financial-editor",
      ts: new Date().toISOString(),
    });
  });

  return router;
}
