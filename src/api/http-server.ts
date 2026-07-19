/**
 * HTTP + Cron — hafif boot; orchestrator ilk tetikte yüklenir.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

function boot(msg: string): void {
  process.stderr.write(`[pipeline] ${msg}\n`);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function loadPipeline() {
  const mod = await import("../autonomous/autonomous-orchestrator.js");
  return mod.runAutonomousPipeline;
}

async function main(): Promise<void> {
  boot("1/4 kök dizin…");
  const { getProjectRootAsync, loadPipelineConfig } = await import(
    "../autonomous/services/config.js"
  );
  const { createLogger } = await import("../autonomous/services/logger.js");
  const log = createLogger("http-server");

  const root = await getProjectRootAsync();
  process.env.QODI_MCP_ROOT = root;
  boot(`1/4 ok → ${root}`);

  boot("2/4 config…");
  const cfg = await loadPipelineConfig();
  boot(
    `2/4 ok → cron=${cfg.cron} everyDays=${cfg.everyDays} port=${cfg.httpPort}`
  );

  const once =
    process.argv.includes("--once") || process.env.PIPELINE_ONCE === "1";

  if (once) {
    boot("pipeline:once — orchestrator yükleniyor…");
    const run = await loadPipeline();
    const result = await run("cli", { force: true });
    boot(result.ok ? "once OK" : `once FAIL: ${result.error}`);
    process.exit(result.ok ? 0 : 1);
  }

  boot("3/4 node-cron…");
  const cron = (await import("node-cron")).default;
  if (!cron.validate(cfg.cron)) {
    boot(`FATAL: geçersiz cron ${cfg.cron}`);
    process.exit(1);
  }
  cron.schedule(cfg.cron, () => {
    log.info("Cron tetikledi", { cron: cfg.cron });
    void loadPipeline()
      .then((run) => run("cron", { force: false }))
      .then((r) =>
        log.info("Cron sonucu", { ok: r.ok, percent: r.percent, error: r.error })
      );
  });
  boot("3/4 ok — cron planlandı");

  boot(`4/4 HTTP :${cfg.httpPort}…`);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${cfg.httpPort}`);
      const path = url.pathname;
      const method = req.method ?? "GET";

      if (method === "GET" && (path === "/" || path === "/api/v1/health")) {
        sendJson(res, 200, {
          ok: true,
          service: "autonomous-financial-editor",
          cron: cfg.cron,
          everyDays: cfg.everyDays,
          trigger: "POST /api/v1/trigger-pipeline",
          ts: new Date().toISOString(),
        });
        return;
      }

      if (method === "POST" && path === "/api/v1/trigger-pipeline") {
        const body = (await readJsonBody(req)) as Record<string, unknown>;
        log.info("HTTP trigger", { source: body.source ?? "anonymous" });
        boot("trigger — orchestrator çalışıyor…");
        const run = await loadPipeline();
        const result = await run("http", {
          ...body,
          force: body.force !== false,
        });
        boot(result.ok ? "trigger OK" : `trigger FAIL: ${result.error}`);
        sendJson(res, result.ok ? 200 : 500, result);
        return;
      }

      sendJson(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("HTTP hata", { err: message });
      sendJson(res, 500, { ok: false, error: message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(cfg.httpPort, "127.0.0.1", () => {
      log.info(`HTTP dinleniyor :${cfg.httpPort}`);
      boot(`HAZIR — http://127.0.0.1:${cfg.httpPort}`);
      boot(
        `curl -s http://127.0.0.1:${cfg.httpPort}/api/v1/health`
      );
      boot(
        `curl -s -X POST http://127.0.0.1:${cfg.httpPort}/api/v1/trigger-pipeline -H 'Content-Type: application/json' -d '{"force":true}'`
      );
      resolve();
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        boot(`HATA: port ${cfg.httpPort} dolu. Çalıştır: lsof -i :${cfg.httpPort}`);
        boot("Sonra: kill <PID>  veya  PIPELINE_HTTP_PORT=8788 npm run pipeline");
      }
      reject(err);
    });
  });
}

main().catch((err) => {
  boot(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
