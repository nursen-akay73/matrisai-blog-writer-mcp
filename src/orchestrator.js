// src/orchestrator.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import cron from "node-cron";

// src/plugins/onchain.ts
async function submitOnChainProof(_payload) {
  return null;
}

// src/orchestrator.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var ROOT = path.join(__dirname, "..");
var CONFIG_FILE = path.join(ROOT, "config", "blog-automation.json");
var LAST_RUN_FILE = path.join(ROOT, "data", "posts", ".last-run");
var POSTS_DIR = path.join(ROOT, "data", "posts");
var ERRORS_DIR = path.join(POSTS_DIR, "errors");
var SERVER_JS = path.join(ROOT, "src", "server.js");
var LEGAL_BLOCK = "Qodi bilgilendirme ama\xE7l\u0131d\u0131r; sundu\u011Fu veri, analiz ve i\xE7erikler yat\u0131r\u0131m tavsiyesi niteli\u011Fi ta\u015F\u0131maz. Yat\u0131r\u0131m tavsiyesi de\u011Fildir.";
var DEFAULT_CONFIG = {
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
    "guvenlik"
  ]
};
function log(message) {
  process.stderr.write(`[orchestrator] ${message}
`);
}
function logError(message, err) {
  const detail = err instanceof Error ? err.stack ?? err.message : String(err ?? "");
  process.stderr.write(
    `[orchestrator:error] ${message}${detail ? `
${detail}` : ""}
`
  );
}
async function loadConfig() {
  let fileCfg = {};
  try {
    fileCfg = JSON.parse(await readFile(CONFIG_FILE, "utf8"));
  } catch {
    log("config yok/okunamad\u0131 \u2014 varsay\u0131lan kullan\u0131l\u0131yor");
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
  const cronExpr = process.env.BLOG_CRON ?? fileCfg.cron ?? `${minute} ${hour} * * *`;
  return {
    ...DEFAULT_CONFIG,
    ...fileCfg,
    everyDays,
    hour,
    minute,
    cron: cronExpr
  };
}
async function daysSinceLastRun() {
  try {
    const raw = await readFile(LAST_RUN_FILE, "utf8");
    const t = Date.parse(raw.trim());
    if (Number.isNaN(t)) return null;
    return (Date.now() - t) / (1e3 * 60 * 60 * 24);
  } catch {
    return null;
  }
}
async function markLastRun() {
  await mkdir(POSTS_DIR, { recursive: true });
  await writeFile(LAST_RUN_FILE, (/* @__PURE__ */ new Date()).toISOString(), "utf8");
}
async function writeErrorLog(payload) {
  await mkdir(ERRORS_DIR, { recursive: true });
  const name = `${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(
    path.join(ERRORS_DIR, name),
    JSON.stringify(payload, null, 2),
    "utf8"
  );
}
function extractText(result) {
  const parts = result.content ?? [];
  return parts.filter((p) => p.type === "text" && p.text).map((p) => p.text).join("\n");
}
async function withMcpClient(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_JS],
    stderr: "pipe",
    cwd: ROOT,
    env: { ...process.env }
  });
  const errStream = transport.stderr;
  if (errStream && typeof errStream.on === "function") {
    errStream.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
  }
  const client = new Client({ name: "qodi-blog-orchestrator", version: "2.2.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => void 0);
    await transport.close().catch(() => void 0);
  }
}
async function mcpGetTopic(client, topic) {
  const result = await client.callTool({
    name: "getQodiInfo",
    arguments: { topic }
  });
  const text = extractText(result);
  if (!text || /geçersiz topic|bulunamadı|başarısız/i.test(text)) {
    throw new Error(`getQodiInfo(${topic}) ba\u015Far\u0131s\u0131z: ${text.slice(0, 200)}`);
  }
  return text;
}
async function mcpCallJson(client, name, args) {
  const result = await client.callTool({
    name,
    arguments: args
  });
  const text = extractText(result);
  if (result.isError) {
    throw new Error(`${name} hata: ${text.slice(0, 400)}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${name} JSON de\u011Fil: ${text.slice(0, 400)}`);
  }
  if (data && typeof data === "object" && "ok" in data && data.ok === false) {
    throw new Error(`${name} reddedildi: ${JSON.stringify(data)}`);
  }
  return data;
}
function stripMarkdownNoise(md) {
  return md.replace(/<!--[\s\S]*?-->/g, "").replace(
    /\|[^\n]+\|/g,
    (row) => row.includes("---") ? "" : row.replace(/\|/g, " ").trim()
  ).replace(/^#{1,6}\s+/gm, "").replace(/\*\*?/g, "").replace(/`+/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
function expandParagraph(lead, source, targetWords) {
  const words = source.split(/\s+/).filter(Boolean);
  const parts = [lead];
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
      "Bu yakla\u015F\u0131m, Matriks veri altyap\u0131s\u0131yla g\xFC\xE7lenen Qodi deneyimini kurumsal kullan\u0131c\u0131lar i\xE7in anla\u015F\u0131l\u0131r k\u0131lar."
    );
    n += 20;
  }
  return parts.join("\n\n");
}
function composeEditorDraft(topics, revision) {
  const title = revision === 0 ? "Qodi ile G\xFCvenli ve KVKK Uyumlu Finansal Analiz" : `Qodi ile G\xFCvenli ve KVKK Uyumlu Finansal Analiz (rev ${revision})`;
  const genel = stripMarkdownNoise(topics.genel_tanim ?? "");
  const farklar = stripMarkdownNoise(topics.farklar ?? "");
  const entegrasyon = stripMarkdownNoise(topics.entegrasyon_genel ?? "");
  const guvenlik = stripMarkdownNoise(topics.guvenlik ?? "");
  const pool = [genel, farklar, entegrasyon, guvenlik].join("\n\n");
  const intro = expandParagraph(
    `Matriks'in geli\u015Ftirdi\u011Fi **Qodi**, T\xFCrkiye'nin yerel finansal yapay zeka asistan\u0131d\u0131r. Bu yaz\u0131da Qodi'nin ne oldu\u011Fu, farklar\u0131, entegrasyon yakla\u015F\u0131m\u0131 ve KVKK uyumlu g\xFCvenlik modeli \xF6zetlenir.`,
    genel,
    180
  );
  const sectionFark = expandParagraph(
    `## Qodi'yi farkl\u0131 k\u0131lan noktalar

Qodi ve Matriks, yerel AI ve finansal veri derinli\u011Fiyle \xF6ne \xE7\u0131kar.`,
    farklar,
    220
  );
  const sectionEnt = expandParagraph(
    `## Entegrasyon ve eri\u015Fim

Qodi deneyimi Matriks MCP \xFCzerinden Claude, Cursor ve benzeri ara\xE7lara ta\u015F\u0131nabilir.`,
    entegrasyon,
    200
  );
  const sectionSec = expandParagraph(
    `## G\xFCvenlik, gizlilik ve KVKK

Yerel i\u015Fleme ve KVKK uyumu, Qodi'nin temel vaatlerindendir.`,
    guvenlik,
    200
  );
  const closing = `## Sonu\xE7

Qodi, Matriks veri altyap\u0131s\u0131yla g\xFC\xE7lenen bir finansal asistan olarak yerel AI avantaj\u0131n\u0131 KVKK uyumuyla birle\u015Ftirir.

## Yasal uyar\u0131

${LEGAL_BLOCK}
`;
  const seoBoost = revision > 0 ? `

## Anahtar noktalar

Qodi, Matriks, KVKK, finansal asistan ve yerel AI bu metinde bilin\xE7li vurgulan\u0131r. ` + expandParagraph("", pool, 120) : "";
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
    closing
  ].join("\n").trim();
  return { title: title.slice(0, 90), content };
}
async function runPipeline(cfg, force = false) {
  if (!force) {
    const since = await daysSinceLastRun();
    if (since !== null && since < cfg.everyDays) {
      log(
        `Atland\u0131: son ko\u015Fudan ${since.toFixed(1)} g\xFCn ge\xE7ti (e\u015Fik ${cfg.everyDays} g\xFCn).`
      );
      return;
    }
  }
  const started = (/* @__PURE__ */ new Date()).toISOString();
  log(`Pipeline ba\u015Flad\u0131 (MCP Client): ${started}`);
  try {
    await mkdir(POSTS_DIR, { recursive: true });
    await mkdir(ERRORS_DIR, { recursive: true });
    await withMcpClient(async (client) => {
      const tools = await client.listTools();
      log(
        `MCP ba\u011Fland\u0131; ara\xE7lar: ${tools.tools.map((t) => t.name).join(", ")}`
      );
      const topicContents = {};
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
        const draft = composeEditorDraft(topicContents, revision);
        log(`Editor taslak: ${draft.title} (rev ${revision})`);
        const refined = await mcpCallJson(client, "refineBlog", {
          title: draft.title,
          content: draft.content
        });
        log(`refineBlog: ${refined.changes?.join("; ") ?? "ok"}`);
        const written = await mcpCallJson(client, "writeBlog", {
          title: refined.title,
          content: refined.content,
          keywords: cfg.keywords,
          category: cfg.category,
          sourceTopics: cfg.sourceTopics
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
        const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        mdPath = path.join(POSTS_DIR, `${day}-qodi-blog.md`);
        await writeFile(
          mdPath,
          [
            `---`,
            `title: ${JSON.stringify(lastTitle)}`,
            `postId: ${lastPostId}`,
            `category: ${cfg.category}`,
            `keywords: ${cfg.keywords.join(", ")}`,
            `generatedAt: ${(/* @__PURE__ */ new Date()).toISOString()}`,
            `sourceTopics: ${cfg.sourceTopics.join(", ")}`,
            `pipeline: editor \u2192 refineBlog \u2192 writeBlog \u2192 reviewBlog`,
            `---`,
            ``,
            lastContent,
            ``
          ].join("\n"),
          "utf8"
        );
        const review = await mcpCallJson(client, "reviewBlog", {
          postId: lastPostId,
          blogMdPath: mdPath
        });
        lastPercent = review.percent;
        log(
          `reviewBlog: %${review.percent} ${review.verdict} \u2192 ${review.reviewPath} (checklist fail=${review.checklistSummary?.fail ?? "?"})`
        );
        if (review.percent >= cfg.scoreThreshold) break;
        if (revision >= cfg.maxRevisions) break;
        revision += 1;
      }
      if (lastPercent < cfg.scoreThreshold) {
        await writeErrorLog({
          at: (/* @__PURE__ */ new Date()).toISOString(),
          reason: "score_below_threshold",
          percent: lastPercent,
          postId: lastPostId
        });
        throw new Error(
          `Blog onaylanmad\u0131: skor ${lastPercent} < ${cfg.scoreThreshold}`
        );
      }
      await markLastRun();
      log(`Blog MD: ${mdPath}`);
      await submitOnChainProof({
        postId: lastPostId,
        contentHash: `sha256-pending-${lastPostId}`,
        publishedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
    log("Pipeline tamamland\u0131.");
  } catch (err) {
    logError("Pipeline ba\u015Far\u0131s\u0131z", err);
    try {
      await writeErrorLog({
        at: (/* @__PURE__ */ new Date()).toISOString(),
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : void 0
      });
    } catch (writeErr) {
      logError("Hata logu yaz\u0131lamad\u0131", writeErr);
    }
    throw err;
  }
}
function startCron(cfg) {
  const task = cron.schedule(cfg.cron, () => {
    void runPipeline(cfg, false).catch(() => void 0);
  });
  log(
    `Cron: "${cfg.cron}" \u2014 her tetiklemede ${cfg.everyDays} g\xFCnde bir ko\u015Fu (BLOG_EVERY_DAYS / config).`
  );
  task.start();
}
async function main() {
  const cfg = await loadConfig();
  const once = process.argv.includes("--once") || process.env.ORCHESTRATOR_ONCE === "1";
  log(
    `Config: everyDays=${cfg.everyDays} hour=${cfg.hour} cron="${cfg.cron}" topics=${cfg.sourceTopics.join(",")}`
  );
  if (once) {
    log("Tek seferlik (--once), everyDays kontrol\xFC atlan\u0131r");
    await runPipeline(cfg, true);
    return;
  }
  startCron(cfg);
  log("Orchestrator dinlemede (MCP Client). \xC7\u0131kmak: Ctrl+C");
  await new Promise(() => void 0);
}
main().catch((err) => {
  logError("Fatal", err);
  process.exit(1);
});
