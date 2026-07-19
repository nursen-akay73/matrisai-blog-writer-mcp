/**
 * Autonomous Financial Editor Pipeline
 *
 * Multi-agent:
 *   Writer Skill  → getQodiInfo + taslak + refineBlog + writeBlog
 *   Editor Skill  → checkBlog + reviewBlog (JSON bulgular)
 *
 * Self-correction: Editor percent < threshold → bulgular Writer'a, max N tur
 * Trigger: cron | http | cli
 *
 * Log: yalnızca internal logger (stderr) — stdout MCP için temiz kalır.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { EditorAgent } from "./agents/editor-agent.js";
import { WriterAgent } from "./agents/writer-agent.js";
import {
  getProjectRoot,
  getProjectRootAsync,
  loadPipelineConfig,
} from "./services/config.js";
import { createLogger } from "./services/logger.js";
import { McpBridge } from "./services/mcp-bridge.js";
import type {
  EditorReport,
  PipelineConfig,
  PipelineResult,
  PipelineTrigger,
  TriggerPayload,
} from "./types.js";

const log = createLogger("autonomous-orchestrator");

let running = false;

async function daysSinceLastRun(lastRunFile: string): Promise<number | null> {
  try {
    const raw = await readFile(lastRunFile, "utf8");
    const t = Date.parse(raw.trim());
    if (Number.isNaN(t)) return null;
    return (Date.now() - t) / (1000 * 60 * 60 * 24);
  } catch {
    return null;
  }
}

async function markLastRun(lastRunFile: string): Promise<void> {
  await mkdir(path.dirname(lastRunFile), { recursive: true });
  await writeFile(lastRunFile, new Date().toISOString(), "utf8");
}

async function writeErrorLog(errorsDir: string, payload: unknown): Promise<void> {
  await mkdir(errorsDir, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(
    path.join(errorsDir, name),
    JSON.stringify(payload, null, 2),
    "utf8"
  );
}

/**
 * Ana pipeline — self-correction döngüsü dahil.
 */
export async function runAutonomousPipeline(
  trigger: PipelineTrigger,
  payload: TriggerPayload = {},
  configOverride?: PipelineConfig
): Promise<PipelineResult> {
  const startedAt = new Date().toISOString();
  const root = await getProjectRootAsync();
  process.env.QODI_MCP_ROOT = root;
  const cfg = configOverride ?? (await loadPipelineConfig());
  const postsDir = path.join(root, "data", "posts");
  const errorsDir = path.join(postsDir, "errors");
  const lastRunFile = path.join(postsDir, ".last-run");

  if (running) {
    return {
      ok: false,
      trigger,
      revisions: 0,
      error: "Pipeline zaten çalışıyor",
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  const force = Boolean(payload.force) || trigger === "cli" || trigger === "http";
  if (!force) {
    const since = await daysSinceLastRun(lastRunFile);
    if (since !== null && since < cfg.everyDays) {
      log.info("everyDays kapısı — atlandı", { since, everyDays: cfg.everyDays });
      return {
        ok: true,
        trigger,
        revisions: 0,
        error: `skipped: last run ${since.toFixed(1)}d ago (need ${cfg.everyDays}d)`,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }
  }

  running = true;
  const mcp = new McpBridge(createLogger("mcp-bridge"));
  let revisions = 0;

  try {
    await mkdir(postsDir, { recursive: true });
    await mkdir(errorsDir, { recursive: true });

    log.info("Pipeline başladı", { trigger, payload: payload.source ?? "local" });

    await mcp.connect();
    const tools = await mcp.listTools();
    log.info("MCP araçları", { tools });

    const writer = new WriterAgent(mcp);
    const editor = new EditorAgent(mcp);

    const sourceTopics = payload.sourceTopics ?? cfg.sourceTopics;
    const keywords = payload.keywords ?? cfg.keywords;
    const category = payload.category ?? cfg.category;

    const topicContents = await writer.loadTopics(sourceTopics);

    let editorFeedback: EditorReport | null = null;
    let lastWriter = null as Awaited<ReturnType<WriterAgent["write"]>> | null;
    let lastReport: EditorReport | null = null;
    let reviewPath: string | undefined;
    let blogPath = "";

    // maxRevisions = tur sayısı (0..maxRevisions-1) veya 0..maxRevisions inclusive?
    // User: max 3 tekrar → attempts 0,1,2 = 3 tries. So revision < maxRevisions
    const maxAttempts = cfg.maxRevisions;

    for (let revision = 0; revision < maxAttempts; revision++) {
      revisions = revision;

      lastWriter = await writer.write({
        sourceTopics,
        topicContents,
        keywords,
        category,
        titleHint: payload.titleHint,
        editorFeedback,
        revision,
      });

      if (lastWriter.status === "rejected") {
        editorFeedback = {
          postId: lastWriter.postId,
          score: 0,
          maxScore: 100,
          percent: 0,
          verdict: "reject",
          findings: [
            {
              code: "WRITE_REJECTED",
              severity: "error",
              message: "writeBlog taslağı rejected; kurallara göre yeniden yaz.",
            },
          ],
          revisionHints: [
            "Kelime 800–2200, yasal uyarı, 3–10 keyword, Qodi/Matriks geçsin.",
          ],
          skill: "editor",
        };
        log.warn("Writer rejected — self-correction", { revision });
        continue;
      }

      const day = new Date().toISOString().slice(0, 10);
      blogPath = path.join(postsDir, `${day}-qodi-blog.md`);
      await writeFile(
        blogPath,
        [
          `---`,
          `title: ${JSON.stringify(lastWriter.title)}`,
          `postId: ${lastWriter.postId}`,
          `category: ${category}`,
          `keywords: ${keywords.join(", ")}`,
          `trigger: ${trigger}`,
          `revision: ${revision}`,
          `pipeline: writer → editor (self-correction)`,
          `generatedAt: ${new Date().toISOString()}`,
          `sourceTopics: ${sourceTopics.join(", ")}`,
          `---`,
          ``,
          lastWriter.content,
          ``,
        ].join("\n"),
        "utf8"
      );

      const { report, reviewPath: rp } = await editor.review(
        lastWriter.postId,
        blogPath
      );
      lastReport = report;
      reviewPath = rp;
      editorFeedback = report;

      // Editor JSON bulgularını da kaydet (self-correction audit)
      const feedbackPath = path.join(
        postsDir,
        `${day}-editor-feedback-r${revision}.json`
      );
      await writeFile(feedbackPath, JSON.stringify(report, null, 2), "utf8");

      log.info("Self-correction turu", {
        revision,
        percent: report.percent,
        verdict: report.verdict,
        threshold: cfg.scoreThreshold,
      });

      if (report.percent >= cfg.scoreThreshold && report.verdict !== "reject") {
        break;
      }

      if (revision === maxAttempts - 1) {
        log.warn("Max revision doldu", { percent: report.percent });
      }
    }

    if (
      !lastWriter ||
      !lastReport ||
      lastReport.percent < cfg.scoreThreshold
    ) {
      await writeErrorLog(errorsDir, {
        at: new Date().toISOString(),
        reason: "score_below_threshold",
        percent: lastReport?.percent,
        postId: lastWriter?.postId,
        revisions,
        findings: lastReport?.findings,
      });
      throw new Error(
        `Blog onaylanmadı: skor ${lastReport?.percent ?? 0} < ${cfg.scoreThreshold}`
      );
    }

    await markLastRun(lastRunFile);

    const result: PipelineResult = {
      ok: true,
      trigger,
      postId: lastWriter.postId,
      blogPath,
      reviewPath,
      percent: lastReport.percent,
      verdict: lastReport.verdict,
      revisions,
      startedAt,
      finishedAt: new Date().toISOString(),
    };

    log.info("Pipeline tamamlandı", result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Pipeline başarısız", { message });
    try {
      await writeErrorLog(errorsDir, {
        at: new Date().toISOString(),
        error: message,
        stack: err instanceof Error ? err.stack : undefined,
      });
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      trigger,
      revisions,
      error: message,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } finally {
    await mcp.close();
    running = false;
  }
}

/** CLI: --once */
export async function runOnceFromCli(): Promise<void> {
  const result = await runAutonomousPipeline("cli", { force: true });
  if (!result.ok) {
    process.exitCode = 1;
  }
}
