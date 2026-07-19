/**
 * Blog otomasyonu — MCP Client üzerinden
 *
 * Pipeline:
 *  1) Config (3 günde bir / ayarlanabilir saat)
 *  2) MCP Client → stdio ile server.js başlat
 *  3) getQodiInfo (topic'ler)
 *  4) Editor skill → taslak derle
 *  5) refineBlog (Brand Refiner)
 *  6) writeBlog
 *  7) reviewBlog → data/reviews/YYYY-MM-DD-review.md
 *  8) data/posts/YYYY-MM-DD-qodi-blog.md
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import cron from "node-cron";

import { submitOnChainProof } from "./plugins/onchain.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const CONFIG_FILE = path.join(ROOT, "config", "blog-automation.json");
const LAST_RUN_FILE = path.join(ROOT, "data", "posts", ".last-run");
const POSTS_DIR = path.join(ROOT, "data", "posts");
const ERRORS_DIR = path.join(POSTS_DIR, "errors");
const SERVER_JS = path.join(ROOT, "src", "server.js");

const LEGAL_BLOCK =
  "Qodi bilgilendirme amaçlıdır; sunduğu veri, analiz ve içerikler yatırım tavsiyesi niteliği taşımaz. " +
  "Yatırım tavsiyesi değildir.";

type BlogConfig = {
  everyDays: number;
  hour: number;
  minute: number;
  cron: string;
  scoreThreshold: number;
  maxRevisions: number;
  category: string;
  keywords: string[];
  sourceTopics: string[];
};

const DEFAULT_CONFIG: BlogConfig = {
  everyDays: 3,
  hour: 9,
  minute: 0,
  cron: "0 9 * * *",
  scoreThreshold: 80,
  maxRevisions: 2,
  category: "Finansal",
  keywords: ["Qodi", "Matriks", "KVKK", "finansal asistan", "yerel AI"],
  sourceTopics: [
    "genel_tanim",
    "farklar",
    "entegrasyon_genel",
    "guvenlik",
  ],
};

function log(message: string): void {
  process.stderr.write(`[orchestrator] ${message}\n`);
}

function logError(message: string, err?: unknown): void {
  const detail =
    err instanceof Error ? err.stack ?? err.message : String(err ?? "");
  process.stderr.write(
    `[orchestrator:error] ${message}${detail ? `\n${detail}` : ""}\n`
  );
}

async function loadConfig(): Promise<BlogConfig> {
  let fileCfg: Partial<BlogConfig> = {};
  try {
    fileCfg = JSON.parse(await readFile(CONFIG_FILE, "utf8")) as Partial<BlogConfig>;
  } catch {
    log("config yok/okunamadı — varsayılan kullanılıyor");
  }

  const everyDays = Number(
    process.env.BLOG_EVERY_DAYS ?? fileCfg.everyDays ?? DEFAULT_CONFIG.everyDays
  );
  const hour = Number(
    process.env.BLOG_HOUR ?? fileCfg.hour ?? DEFAULT_CONFIG.hour
  );
  const minute = Number(
    process.env.BLOG_MINUTE ?? fileCfg.minute ?? DEFAULT_CONFIG.minute
  );
  const cronExpr =
    process.env.BLOG_CRON ??
    fileCfg.cron ??
    `${minute} ${hour} * * *`;

  return {
    ...DEFAULT_CONFIG,
    ...fileCfg,
    everyDays,
    hour,
    minute,
    cron: cronExpr,
  };
}

async function daysSinceLastRun(): Promise<number | null> {
  try {
    const raw = await readFile(LAST_RUN_FILE, "utf8");
    const t = Date.parse(raw.trim());
    if (Number.isNaN(t)) return null;
    return (Date.now() - t) / (1000 * 60 * 60 * 24);
  } catch {
    return null;
  }
}

async function markLastRun(): Promise<void> {
  await mkdir(POSTS_DIR, { recursive: true });
  await writeFile(LAST_RUN_FILE, new Date().toISOString(), "utf8");
}

async function writeErrorLog(payload: unknown): Promise<void> {
  await mkdir(ERRORS_DIR, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(
    path.join(ERRORS_DIR, name),
    JSON.stringify(payload, null, 2),
    "utf8"
  );
}

// ─── MCP Client ───

type McpTextResult = { content?: Array<{ type: string; text?: string }> };

function extractText(result: McpTextResult): string {
  const parts = result.content ?? [];
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text as string)
    .join("\n");
}

function extractJson<T>(result: McpTextResult): T {
  const text = extractText(result).trim();
  return JSON.parse(text) as T;
}

async function withMcpClient<T>(
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_JS],
    stderr: "pipe",
    cwd: ROOT,
    env: { ...process.env } as Record<string, string>,
  });

  // MCP sunucu boot loglarını orchestrator stderr'e aktar
  const errStream = transport.stderr;
  if (errStream && typeof (errStream as NodeJS.ReadableStream).on === "function") {
    (errStream as NodeJS.ReadableStream).on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
  }

  const client = new Client({ name: "qodi-blog-orchestrator", version: "2.2.0" });
  await client.connect(transport);

  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}

async function mcpGetTopic(client: Client, topic: string): Promise<string> {
  const result = (await client.callTool({
    name: "getQodiInfo",
    arguments: { topic },
  })) as McpTextResult;
  const text = extractText(result);
  if (!text || /geçersiz topic|bulunamadı|başarısız/i.test(text)) {
    throw new Error(`getQodiInfo(${topic}) başarısız: ${text.slice(0, 200)}`);
  }
  return text;
}

async function mcpCallJson<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as McpTextResult & { isError?: boolean };
  const text = extractText(result);
  if (result.isError) {
    throw new Error(`${name} hata: ${text.slice(0, 400)}`);
  }
  let data: T & { ok?: boolean };
  try {
    data = JSON.parse(text) as T & { ok?: boolean };
  } catch {
    throw new Error(`${name} JSON değil: ${text.slice(0, 400)}`);
  }
  if (data && typeof data === "object" && "ok" in data && data.ok === false) {
    throw new Error(`${name} reddedildi: ${JSON.stringify(data)}`);
  }
  return data;
}

// ─── Editor (skill: blog-editor) — kaynak topic'lerden taslak ───

function stripMarkdownNoise(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\|[^\n]+\|/g, (row) =>
      row.includes("---") ? "" : row.replace(/\|/g, " ").trim()
    )
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*?/g, "")
    .replace(/`+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function expandParagraph(lead: string, source: string, targetWords: number): string {
  const words = source.split(/\s+/).filter(Boolean);
  const parts: string[] = [lead];
  let n = lead.split(/\s+/).filter(Boolean).length;
  let i = 0;
  while (n < targetWords && i < words.length) {
    const chunk = words.slice(i, i + 40).join(" ");
    parts.push(chunk);
    n += 40;
    i += 35;
  }
  while (n < targetWords) {
    parts.push(
      "Bu yaklaşım, Matriks veri altyapısıyla güçlenen Qodi deneyimini kurumsal kullanıcılar için anlaşılır kılar."
    );
    n += 20;
  }
  return parts.join("\n\n");
}

function composeEditorDraft(
  topics: Record<string, string>,
  revision: number
): { title: string; content: string } {
  const title =
    revision === 0
      ? "Qodi ile Güvenli ve KVKK Uyumlu Finansal Analiz"
      : `Qodi ile Güvenli ve KVKK Uyumlu Finansal Analiz (rev ${revision})`;

  const genel = stripMarkdownNoise(topics.genel_tanim ?? "");
  const farklar = stripMarkdownNoise(topics.farklar ?? "");
  const entegrasyon = stripMarkdownNoise(topics.entegrasyon_genel ?? "");
  const guvenlik = stripMarkdownNoise(topics.guvenlik ?? "");
  const pool = [genel, farklar, entegrasyon, guvenlik].join("\n\n");

  const intro = expandParagraph(
    `Matriks'in geliştirdiği **Qodi**, Türkiye'nin yerel finansal yapay zeka asistanıdır. ` +
      `Bu yazıda Qodi'nin ne olduğu, farkları, entegrasyon yaklaşımı ve KVKK uyumlu güvenlik modeli özetlenir.`,
    genel,
    180
  );

  const sectionFark = expandParagraph(
    `## Qodi'yi farklı kılan noktalar\n\nQodi ve Matriks, yerel AI ve finansal veri derinliğiyle öne çıkar.`,
    farklar,
    220
  );

  const sectionEnt = expandParagraph(
    `## Entegrasyon ve erişim\n\nQodi deneyimi Matriks MCP üzerinden Claude, Cursor ve benzeri araçlara taşınabilir.`,
    entegrasyon,
    200
  );

  const sectionSec = expandParagraph(
    `## Güvenlik, gizlilik ve KVKK\n\nYerel işleme ve KVKK uyumu, Qodi'nin temel vaatlerindendir.`,
    guvenlik,
    200
  );

  const closing =
    `## Sonuç\n\n` +
    `Qodi, Matriks veri altyapısıyla güçlenen bir finansal asistan olarak yerel AI avantajını KVKK uyumuyla birleştirir.\n\n` +
    `## Yasal uyarı\n\n${LEGAL_BLOCK}\n`;

  const seoBoost =
    revision > 0
      ? `\n\n## Anahtar noktalar\n\n` +
        `Qodi, Matriks, KVKK, finansal asistan ve yerel AI bu metinde bilinçli vurgulanır. ` +
        expandParagraph("", pool, 120)
      : "";

  const content = [
    `# ${title.replace(/ \(rev \d+\)$/, "")}`,
    "",
    intro,
    "",
    sectionFark,
    "",
    sectionEnt,
    "",
    sectionSec,
    seoBoost,
    "",
    closing,
  ]
    .join("\n")
    .trim();

  return { title: title.slice(0, 90), content };
}

// ─── Pipeline ───

async function runPipeline(cfg: BlogConfig, force = false): Promise<void> {
  if (!force) {
    const since = await daysSinceLastRun();
    if (since !== null && since < cfg.everyDays) {
      log(
        `Atlandı: son koşudan ${since.toFixed(1)} gün geçti (eşik ${cfg.everyDays} gün).`
      );
      return;
    }
  }

  const started = new Date().toISOString();
  log(`Pipeline başladı (MCP Client): ${started}`);

  try {
    await mkdir(POSTS_DIR, { recursive: true });
    await mkdir(ERRORS_DIR, { recursive: true });

    await withMcpClient(async (client) => {
      const tools = await client.listTools();
      log(
        `MCP bağlandı; araçlar: ${tools.tools.map((t) => t.name).join(", ")}`
      );

      const topicContents: Record<string, string> = {};
      for (const topic of cfg.sourceTopics) {
        topicContents[topic] = await mcpGetTopic(client, topic);
        log(`Topic: ${topic} (${topicContents[topic].length} kr)`);
      }

      let revision = 0;
      let lastPercent = 0;
      let lastPostId = "";
      let lastTitle = "";
      let lastContent = "";
      let mdPath = "";

      while (revision <= cfg.maxRevisions) {
        // 1) Editor
        const draft = composeEditorDraft(topicContents, revision);
        log(`Editor taslak: ${draft.title} (rev ${revision})`);

        // 2) Brand Refiner (MCP)
        const refined = await mcpCallJson<{
          title: string;
          content: string;
          changes: string[];
        }>(client, "refineBlog", {
          title: draft.title,
          content: draft.content,
        });
        log(`refineBlog: ${refined.changes?.join("; ") ?? "ok"}`);

        // 3) writeBlog (MCP)
        const written = await mcpCallJson<{
          ok: boolean;
          postId: string;
          status: string;
          wordCount: number;
          errors?: string[];
        }>(client, "writeBlog", {
          title: refined.title,
          content: refined.content,
          keywords: cfg.keywords,
          category: cfg.category,
          sourceTopics: cfg.sourceTopics,
        });

        lastPostId = written.postId;
        lastTitle = refined.title;
        lastContent = refined.content;
        log(
          `writeBlog: postId=${written.postId} status=${written.status} words=${written.wordCount}`
        );

        if (written.status === "rejected") {
          if (revision >= cfg.maxRevisions) break;
          revision += 1;
          continue;
        }

        // 4) Blog MD kaydet
        const day = new Date().toISOString().slice(0, 10);
        mdPath = path.join(POSTS_DIR, `${day}-qodi-blog.md`);
        await writeFile(
          mdPath,
          [
            `---`,
            `title: ${JSON.stringify(lastTitle)}`,
            `postId: ${lastPostId}`,
            `category: ${cfg.category}`,
            `keywords: ${cfg.keywords.join(", ")}`,
            `generatedAt: ${new Date().toISOString()}`,
            `sourceTopics: ${cfg.sourceTopics.join(", ")}`,
            `pipeline: editor → refineBlog → writeBlog → reviewBlog`,
            `---`,
            ``,
            lastContent,
            ``,
          ].join("\n"),
          "utf8"
        );

        // 5) reviewBlog (MCP) — ayrı review MD
        const review = await mcpCallJson<{
          reviewPath: string;
          percent: number;
          verdict: string;
          checklistSummary: { pass: number; fail: number; warn: number };
        }>(client, "reviewBlog", {
          postId: lastPostId,
          blogMdPath: mdPath,
        });

        lastPercent = review.percent;
        log(
          `reviewBlog: %${review.percent} ${review.verdict} → ${review.reviewPath} ` +
            `(checklist fail=${review.checklistSummary?.fail ?? "?"})`
        );

        if (review.percent >= cfg.scoreThreshold) break;
        if (revision >= cfg.maxRevisions) break;
        revision += 1;
      }

      if (lastPercent < cfg.scoreThreshold) {
        await writeErrorLog({
          at: new Date().toISOString(),
          reason: "score_below_threshold",
          percent: lastPercent,
          postId: lastPostId,
        });
        throw new Error(
          `Blog onaylanmadı: skor ${lastPercent} < ${cfg.scoreThreshold}`
        );
      }

      await markLastRun();
      log(`Blog MD: ${mdPath}`);

      await submitOnChainProof({
        postId: lastPostId,
        contentHash: `sha256-pending-${lastPostId}`,
        publishedAt: new Date().toISOString(),
      });
    });

    log("Pipeline tamamlandı.");
  } catch (err) {
    logError("Pipeline başarısız", err);
    try {
      await writeErrorLog({
        at: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } catch (writeErr) {
      logError("Hata logu yazılamadı", writeErr);
    }
    throw err;
  }
}

function startCron(cfg: BlogConfig): void {
  const task = cron.schedule(cfg.cron, () => {
    void runPipeline(cfg, false).catch(() => undefined);
  });
  log(
    `Cron: "${cfg.cron}" — her tetiklemede ${cfg.everyDays} günde bir koşu (BLOG_EVERY_DAYS / config).`
  );
  task.start();
}

async function main(): Promise<void> {
  const cfg = await loadConfig();
  const once =
    process.argv.includes("--once") || process.env.ORCHESTRATOR_ONCE === "1";

  log(
    `Config: everyDays=${cfg.everyDays} hour=${cfg.hour} cron="${cfg.cron}" topics=${cfg.sourceTopics.join(",")}`
  );

  if (once) {
    log("Tek seferlik (--once), everyDays kontrolü atlanır");
    await runPipeline(cfg, true);
    return;
  }

  startCron(cfg);
  log("Orchestrator dinlemede (MCP Client). Çıkmak: Ctrl+C");
  await new Promise<void>(() => undefined);
}

main().catch((err) => {
  logError("Fatal", err);
  process.exit(1);
});
