/**
 * Hafif giriş (saf Node, Express yok).
 * Orchestrator: node --import tsx ile .ts yüklenir.
 */
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");

function boot(msg) {
  process.stderr.write(`[pipeline] ${msg}\n`);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function main() {
  process.chdir(ROOT);
  process.env.QODI_MCP_ROOT = ROOT;
  boot(`1/4 kök → ${ROOT}`);

  boot("2/4 config…");
  const { loadPipelineConfig } = await import(
    pathToFileURL(path.join(ROOT, "src/autonomous/services/config.ts")).href
  );
  const cfg = await loadPipelineConfig();
  boot(
    `2/4 ok → cron=${cfg.cron} everyDays=${cfg.everyDays} port=${cfg.httpPort}`
  );

  const once =
    process.argv.includes("--once") || process.env.PIPELINE_ONCE === "1";

  async function runPipeline(trigger, payload) {
    boot("orchestrator yükleniyor…");
    const { runAutonomousPipeline } = await import(
      pathToFileURL(
        path.join(ROOT, "src/autonomous/autonomous-orchestrator.ts")
      ).href
    );
    return runAutonomousPipeline(trigger, payload);
  }

  if (once) {
    const result = await runPipeline("cli", { force: true });
    boot(result.ok ? "once OK" : `once FAIL: ${result.error}`);
    process.exit(result.ok ? 0 : 1);
  }

  boot("3/4 cron…");
  const cron = (await import("node-cron")).default;
  if (!cron.validate(cfg.cron)) {
    boot(`FATAL cron: ${cfg.cron}`);
    process.exit(1);
  }
  cron.schedule(cfg.cron, () => {
    boot("cron tetik");
    void runPipeline("cron", { force: false }).then((r) =>
      boot(`cron sonuç ok=${r.ok}`)
    );
  });
  boot("3/4 ok");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (
        req.method === "GET" &&
        (url.pathname === "/" || url.pathname === "/api/v1/health")
      ) {
        sendJson(res, 200, {
          ok: true,
          service: "autonomous-financial-editor",
          cron: cfg.cron,
          everyDays: cfg.everyDays,
          trigger: "POST /api/v1/trigger-pipeline",
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/v1/trigger-pipeline") {
        const body = await readJsonBody(req);
        boot("HTTP trigger…");
        const result = await runPipeline("http", {
          ...body,
          force: body.force !== false,
        });
        boot(result.ok ? "trigger OK" : `trigger FAIL: ${result.error}`);
        sendJson(res, result.ok ? 200 : 500, result);
        return;
      }
      sendJson(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 8787 doluysa 8788, 8789… dene
  let port = cfg.httpPort;
  for (let i = 0; i < 5; i++) {
    try {
      await new Promise((resolve, reject) => {
        const onErr = (err) => {
          server.off("listening", onListen);
          reject(err);
        };
        const onListen = () => {
          server.off("error", onErr);
          resolve();
        };
        server.once("error", onErr);
        server.once("listening", onListen);
        boot(`4/4 HTTP :${port}…`);
        server.listen(port, "127.0.0.1");
      });
      boot(`HAZIR — http://127.0.0.1:${port}`);
      boot(
        `curl -s -X POST http://127.0.0.1:${port}/api/v1/trigger-pipeline -H 'Content-Type: application/json' -d '{"force":true}'`
      );
      return;
    } catch (err) {
      if (err.code === "EADDRINUSE") {
        boot(`port ${port} dolu, sonraki deneniyor…`);
        port += 1;
        continue;
      }
      throw err;
    }
  }
  boot("FATAL: boş port bulunamadı (8787–8791)");
  process.exit(1);
}

main().catch((err) => {
  boot(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
