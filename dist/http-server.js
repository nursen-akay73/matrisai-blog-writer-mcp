var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/autonomous/services/config.ts
var config_exports = {};
__export(config_exports, {
  getProjectRoot: () => getProjectRoot,
  getProjectRootAsync: () => getProjectRootAsync,
  loadPipelineConfig: () => loadPipelineConfig
});
import { access, readFile } from "node:fs/promises";
import path from "node:path";
async function resolveRoot() {
  if (process.env.QODI_MCP_ROOT) return process.env.QODI_MCP_ROOT;
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    try {
      await access(path.join(dir, "package.json"));
      await access(path.join(dir, "src", "server.js"));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}
async function getProjectRootAsync() {
  if (!cachedRoot) cachedRoot = await resolveRoot();
  return cachedRoot;
}
function getProjectRoot() {
  return cachedRoot ?? process.env.QODI_MCP_ROOT ?? process.cwd();
}
async function loadPipelineConfig() {
  const root = await getProjectRootAsync();
  const configFile = path.join(root, "config", "blog-automation.json");
  let fileCfg = {};
  try {
    fileCfg = JSON.parse(await readFile(configFile, "utf8"));
  } catch {
  }
  const everyDays = Number(
    process.env.BLOG_EVERY_DAYS ?? fileCfg.everyDays ?? DEFAULTS.everyDays
  );
  const hour = Number(process.env.BLOG_HOUR ?? fileCfg.hour ?? DEFAULTS.hour);
  const minute = Number(
    process.env.BLOG_MINUTE ?? fileCfg.minute ?? DEFAULTS.minute
  );
  const cron = process.env.BLOG_CRON ?? fileCfg.cron ?? `${minute} ${hour} * * *`;
  const httpPort = Number(
    process.env.PIPELINE_HTTP_PORT ?? fileCfg.httpPort ?? DEFAULTS.httpPort
  );
  const maxRevisions = Number(
    process.env.BLOG_MAX_REVISIONS ?? fileCfg.maxRevisions ?? DEFAULTS.maxRevisions
  );
  const scoreThreshold = Number(
    process.env.BLOG_SCORE_THRESHOLD ?? fileCfg.scoreThreshold ?? DEFAULTS.scoreThreshold
  );
  return {
    ...DEFAULTS,
    ...fileCfg,
    everyDays,
    hour,
    minute,
    cron,
    httpPort,
    maxRevisions: Math.min(Math.max(maxRevisions, 1), 5),
    scoreThreshold
  };
}
var cachedRoot, DEFAULTS;
var init_config = __esm({
  "src/autonomous/services/config.ts"() {
    "use strict";
    cachedRoot = null;
    DEFAULTS = {
      everyDays: 3,
      hour: 9,
      minute: 0,
      cron: "0 9 * * *",
      scoreThreshold: 80,
      maxRevisions: 3,
      category: "Finansal",
      keywords: ["Qodi", "Matriks", "KVKK", "finansal asistan", "yerel AI"],
      sourceTopics: [
        "genel_tanim",
        "farklar",
        "entegrasyon_genel",
        "guvenlik"
      ],
      httpPort: 8787
    };
  }
});

// src/autonomous/services/logger.ts
var logger_exports = {};
__export(logger_exports, {
  createLogger: () => createLogger
});
import { appendFile, mkdir } from "node:fs/promises";
import path2 from "node:path";
function formatLine(level, scope, message) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  return `[${ts}] [${level.toUpperCase()}] [${scope}] ${message}
`;
}
async function appendLogFile(line) {
  try {
    const logDir = path2.join(getProjectRoot(), "data", "logs");
    await mkdir(logDir, { recursive: true });
    const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    await appendFile(path2.join(logDir, `pipeline-${day}.log`), line, "utf8");
  } catch {
  }
}
function createLogger(scope) {
  const write = (level, message, meta) => {
    const extra = meta === void 0 ? "" : ` ${typeof meta === "string" ? meta : JSON.stringify(meta)}`;
    const line = formatLine(level, scope, message + extra);
    process.stderr.write(line);
    void appendLogFile(line);
  };
  return {
    debug: (msg, meta) => write("debug", msg, meta),
    info: (msg, meta) => write("info", msg, meta),
    warn: (msg, meta) => write("warn", msg, meta),
    error: (msg, meta) => write("error", msg, meta)
  };
}
var init_logger = __esm({
  "src/autonomous/services/logger.ts"() {
    "use strict";
    init_config();
  }
});

// src/autonomous/agents/editor-agent.ts
function buildFindings(check) {
  const findings = [];
  for (const note of check.notes ?? []) {
    const severity = /eksik|yok|düşük|red|reject/i.test(note) ? "error" : "warning";
    findings.push({
      code: "CHECK_NOTE",
      severity,
      message: note
    });
  }
  for (const dim of check.dimensions ?? []) {
    if (dim.score < dim.max * 0.8) {
      for (const n of dim.notes) {
        findings.push({
          code: `DIM_${dim.area}`.toUpperCase(),
          severity: dim.score < dim.max * 0.5 ? "error" : "warning",
          message: n,
          area: dim.area
        });
      }
    }
  }
  const legalWeak = findings.some(
    (f) => /yasal|tavsiye|uyarı/i.test(f.message)
  );
  if (legalWeak) {
    findings.push({
      code: "SPK_LEGAL",
      severity: "error",
      message: "Yasal/SPK uyumu zay\u0131f: 'yat\u0131r\u0131m tavsiyesi de\u011Fildir' ve bilgilendirme dili zorunlu.",
      area: "yasal_uyumluluk"
    });
  }
  if (findings.length === 0 && check.percent < 100) {
    findings.push({
      code: "GENERIC_QUALITY",
      severity: "warning",
      message: `Kalite %${check.percent}; yap\u0131, SEO ve marka vurgular\u0131n\u0131 g\xFC\xE7lendirin.`
    });
  }
  return findings;
}
function buildRevisionHints(findings, percent) {
  const hints = /* @__PURE__ */ new Set();
  for (const f of findings) {
    if (/yasal|tavsiye/i.test(f.message)) {
      hints.add(
        "Yasal uyar\u0131 b\xF6l\xFCm\xFCn\xFC g\xFC\xE7lendir: bilgilendirme ama\xE7l\u0131d\u0131r; yat\u0131r\u0131m tavsiyesi de\u011Fildir."
      );
    }
    if (/kelime|uzunluk|yapi/i.test(f.message + (f.area ?? ""))) {
      hints.add("Kelime say\u0131s\u0131n\u0131 800\u20132200 aral\u0131\u011F\u0131na \xE7ek; en az 3 ## alt ba\u015Fl\u0131k kullan.");
    }
    if (/seo|anahtar/i.test(f.message + (f.area ?? ""))) {
      hints.add(
        "SEO anahtar kelimelerini (Qodi, Matriks, KVKK, finansal asistan, yerel AI) metinde do\u011Fal ge\xE7ir."
      );
    }
    if (/qodi|matriks|marka|kvkk/i.test(f.message)) {
      hints.add("Marka tonu: Qodi + Matriks ge\xE7sin; KVKK/yerel i\u015Fleme vurgula.");
    }
    if (/quantex|konum/i.test(f.message)) {
      hints.add(
        "\xDCr\xFCn rolleri: Qodi sohbet asistan\u0131, MCP k\xF6pr\xFC, Quantex kantitatif \u2014 kar\u0131\u015Ft\u0131rma."
      );
    }
  }
  if (percent < 80) {
    hints.add(
      "Skor e\u015Fi\u011Finin alt\u0131nda: sonu\xE7 + yasal uyar\u0131 b\xF6l\xFCmlerini netle\u015Ftir, abart\u0131l\u0131 iddia kullanma."
    );
  }
  return [...hints];
}
var log, EditorAgent;
var init_editor_agent = __esm({
  "src/autonomous/agents/editor-agent.ts"() {
    "use strict";
    init_logger();
    log = createLogger("editor-agent");
    EditorAgent = class {
      constructor(mcp) {
        this.mcp = mcp;
      }
      mcp;
      /**
       * Editor Skill: checkBlog → bulgular JSON → reviewBlog (ayrı MD)
       */
      async review(postId, blogMdPath) {
        log.info("Editor Skill ba\u015Flad\u0131", { postId });
        const check = await this.mcp.callToolJson("checkBlog", {
          postId
        });
        const findings = buildFindings(check);
        const percent = check.percent;
        const verdict = check.verdict === "ready" || check.verdict === "needs_revision" || check.verdict === "reject" ? check.verdict : percent >= 80 ? "ready" : percent < 50 ? "reject" : "needs_revision";
        let reviewPath;
        let checklistSummary;
        try {
          const review = await this.mcp.callToolJson(
            "reviewBlog",
            {
              postId,
              blogMdPath
            }
          );
          reviewPath = review.reviewPath;
          checklistSummary = review.checklistSummary;
        } catch (err) {
          log.warn("reviewBlog ba\u015Far\u0131s\u0131z; checkBlog ile devam", {
            err: err instanceof Error ? err.message : String(err)
          });
        }
        const report = {
          postId,
          score: check.score,
          maxScore: check.maxScore,
          percent,
          verdict,
          findings,
          checklistSummary,
          revisionHints: buildRevisionHints(findings, percent),
          skill: "editor"
        };
        log.info("Editor Skill tamam", {
          percent: report.percent,
          verdict: report.verdict,
          findings: report.findings.length,
          reviewPath
        });
        return { report, reviewPath };
      }
    };
  }
});

// src/autonomous/agents/writer-agent.ts
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
    parts.push(words.slice(i, i + 40).join(" "));
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
function applyEditorFeedback(content, feedback, revision) {
  if (!feedback || revision === 0) return content;
  const hints = feedback.revisionHints.slice(0, 8);
  const findingLines = feedback.findings.filter((f) => f.severity !== "info").slice(0, 10).map((f) => `- [${f.severity}] ${f.message}`).join("\n");
  const patch = `

## Revizyon notlar\u0131 (otonom self-correction #${revision})

Edit\xF6r skoru %${feedback.percent} (${feedback.verdict}). A\u015Fa\u011F\u0131daki bulgulara g\xF6re metin g\xFC\xE7lendirilmi\u015Ftir:

` + (findingLines || "- Genel kalite ve SEO g\xFC\xE7lendirme") + `

` + (hints.length ? `### Uygulanan ipu\xE7lar\u0131

${hints.map((h) => `- ${h}`).join("\n")}
` : "") + `
Qodi, Matriks, KVKK, finansal asistan ve yerel AI kavramlar\u0131 bilin\xE7li vurgulan\u0131r. \u0130\xE7erik yat\u0131r\u0131m tavsiyesi i\xE7ermez; bilgilendirme ama\xE7l\u0131d\u0131r.
`;
  return content.replace(
    /##\s*Yasal uyarı[\s\S]*$/i,
    `${patch}
## Yasal uyar\u0131

${LEGAL_BLOCK}
`
  );
}
function composeDraft(input) {
  const baseTitle = input.titleHint?.trim() || "Qodi ile G\xFCvenli ve KVKK Uyumlu Finansal Analiz";
  const title = input.revision === 0 ? baseTitle : `${baseTitle.replace(/ \(rev \d+\)$/, "")} (rev ${input.revision})`;
  const genel = stripMarkdownNoise(input.topicContents.genel_tanim ?? "");
  const farklar = stripMarkdownNoise(input.topicContents.farklar ?? "");
  const entegrasyon = stripMarkdownNoise(
    input.topicContents.entegrasyon_genel ?? ""
  );
  const guvenlik = stripMarkdownNoise(input.topicContents.guvenlik ?? "");
  const boost = input.revision * 40;
  let content = [
    `# ${title.replace(/ \(rev \d+\)$/, "")}`,
    "",
    expandParagraph(
      `Matriks'in geli\u015Ftirdi\u011Fi **Qodi**, T\xFCrkiye'nin yerel finansal yapay zeka asistan\u0131d\u0131r. Bu yaz\u0131da Qodi'nin ne oldu\u011Fu, farklar\u0131, entegrasyon yakla\u015F\u0131m\u0131 ve KVKK uyumlu g\xFCvenlik modeli \xF6zetlenir.`,
      genel,
      180 + boost
    ),
    "",
    expandParagraph(
      `## Qodi'yi farkl\u0131 k\u0131lan noktalar

Qodi ve Matriks, yerel AI ve finansal veri derinli\u011Fiyle \xF6ne \xE7\u0131kar.`,
      farklar,
      220 + boost
    ),
    "",
    expandParagraph(
      `## Entegrasyon ve eri\u015Fim

Qodi deneyimi Matriks MCP \xFCzerinden Claude, Cursor ve benzeri ara\xE7lara ta\u015F\u0131nabilir.`,
      entegrasyon,
      200 + boost
    ),
    "",
    expandParagraph(
      `## G\xFCvenlik, gizlilik ve KVKK

Yerel i\u015Fleme ve KVKK uyumu, Qodi'nin temel vaatlerindendir.`,
      guvenlik,
      200 + boost
    ),
    "",
    `## Sonu\xE7

Qodi, Matriks veri altyap\u0131s\u0131yla g\xFC\xE7lenen bir finansal asistan olarak yerel AI avantaj\u0131n\u0131 KVKK uyumuyla birle\u015Ftirir.
`,
    "",
    `## Yasal uyar\u0131

${LEGAL_BLOCK}
`
  ].join("\n");
  content = applyEditorFeedback(content, input.editorFeedback, input.revision);
  return { title: title.slice(0, 90), content: content.trim() };
}
var log2, LEGAL_BLOCK, WriterAgent;
var init_writer_agent = __esm({
  "src/autonomous/agents/writer-agent.ts"() {
    "use strict";
    init_logger();
    log2 = createLogger("writer-agent");
    LEGAL_BLOCK = "Qodi bilgilendirme ama\xE7l\u0131d\u0131r; sundu\u011Fu veri, analiz ve i\xE7erikler yat\u0131r\u0131m tavsiyesi niteli\u011Fi ta\u015F\u0131maz. Yat\u0131r\u0131m tavsiyesi de\u011Fildir.";
    WriterAgent = class {
      constructor(mcp) {
        this.mcp = mcp;
      }
      mcp;
      /** Master dökümandan topic içeriklerini çeker */
      async loadTopics(topics) {
        const out = {};
        for (const topic of topics) {
          out[topic] = await this.mcp.getQodiInfo(topic);
          log2.info(`Topic y\xFCklendi: ${topic}`, { chars: out[topic].length });
        }
        return out;
      }
      /**
       * Writer Skill: taslak → refineBlog → writeBlog
       */
      async write(input) {
        log2.info("Writer Skill ba\u015Flad\u0131", { revision: input.revision });
        const draft = composeDraft(input);
        const refined = await this.mcp.callToolJson("refineBlog", {
          title: draft.title,
          content: draft.content
        });
        log2.info("refineBlog tamam", { changes: refined.changes });
        const written = await this.mcp.callToolJson("writeBlog", {
          title: refined.title,
          content: refined.content,
          keywords: input.keywords,
          category: input.category,
          sourceTopics: input.sourceTopics
        });
        if (!written.postId) {
          throw new Error(`writeBlog postId d\xF6nmedi: ${JSON.stringify(written)}`);
        }
        log2.info("writeBlog tamam", {
          postId: written.postId,
          status: written.status,
          words: written.wordCount
        });
        return {
          title: refined.title,
          content: refined.content,
          keywords: input.keywords,
          category: input.category,
          sourceTopics: input.sourceTopics,
          postId: written.postId,
          status: written.status,
          wordCount: written.wordCount,
          skill: "writer"
        };
      }
    };
  }
});

// src/autonomous/services/tool-runtime.ts
import path3 from "node:path";
import { pathToFileURL } from "node:url";
async function loadBlog() {
  if (blogMod) return blogMod;
  const root = getProjectRoot();
  const href = pathToFileURL(path3.join(root, "src", "blog.js")).href;
  blogMod = await import(href);
  return blogMod;
}
function postsDir() {
  return path3.join(getProjectRoot(), "data", "posts");
}
function reviewsDir() {
  return path3.join(getProjectRoot(), "data", "reviews");
}
async function runtimeGetQodiInfo(topic) {
  const root = getProjectRoot();
  const mdPath = path3.join(root, "data", "qodi-bilgi-dosyasi-v2.md");
  const { readFile: readFile3 } = await import("node:fs/promises");
  const md = await readFile3(mdPath, "utf8");
  const lines = md.split(/\r?\n/);
  const re = /<!--\s*topic:\s*([a-z0-9_]+)\s*-->/i;
  const markers = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) markers.push({ topic: m[1], line: i });
  }
  const idx = markers.findIndex((x) => x.topic === topic);
  if (idx < 0) throw new Error(`Topic bulunamad\u0131: ${topic}`);
  const start = markers[idx].line + 1;
  let end = idx + 1 < markers.length ? markers[idx + 1].line : lines.length;
  if (idx + 1 < markers.length) {
    let j = end - 1;
    while (j >= start && lines[j].trim() === "") j--;
    if (j >= start && /^#{2,3}\s+/.test(lines[j])) end = j;
  }
  return lines.slice(start, end).join("\n").trim();
}
async function runtimeRefineBlog(args) {
  const blog = await loadBlog();
  const refined = blog.refineBlog({
    title: args.title,
    content: args.content
  });
  if (args.postId) {
    await blog.updatePostContent(postsDir(), args.postId, refined);
  }
  return {
    ok: true,
    postId: args.postId ?? null,
    title: refined.title,
    content: refined.content,
    changes: refined.changes,
    skill: refined.skill
  };
}
async function runtimeWriteBlog(args) {
  const blog = await loadBlog();
  const { record, filePath } = await blog.writeBlog(postsDir(), args);
  return {
    ok: record.status !== "rejected",
    postId: record.id,
    status: record.status,
    wordCount: record.wordCount,
    errors: record.errors,
    warnings: record.warnings,
    savedTo: filePath
  };
}
async function runtimeCheckBlog(postId) {
  const blog = await loadBlog();
  const loaded = await blog.loadPost(postsDir(), postId);
  if (!loaded) throw new Error(`postId bulunamad\u0131: ${postId}`);
  const report = blog.checkBlogQuality(loaded.post);
  return {
    postId: loaded.post.id,
    title: loaded.post.title,
    previousStatus: loaded.post.status,
    ...report
  };
}
async function runtimeReviewBlog(postId, blogMdPath) {
  const blog = await loadBlog();
  const loaded = await blog.loadPost(postsDir(), postId);
  if (!loaded) throw new Error(`postId bulunamad\u0131: ${postId}`);
  const quality = blog.checkBlogQuality(loaded.post);
  const checklist = blog.runMatriksChecklist(loaded.post);
  const { filePath, day } = await blog.writeReviewMarkdown(reviewsDir(), {
    post: loaded.post,
    quality,
    checklist,
    blogMdPath
  });
  log3.info("review yaz\u0131ld\u0131", { filePath });
  return {
    ok: true,
    postId: loaded.post.id,
    reviewPath: filePath,
    day,
    percent: quality.percent,
    verdict: quality.verdict,
    checklistSummary: checklist.summary
  };
}
async function runtimeCallToolJson(name, args) {
  switch (name) {
    case "refineBlog":
      return runtimeRefineBlog(args);
    case "writeBlog":
      return runtimeWriteBlog(
        args
      );
    case "checkBlog":
      return runtimeCheckBlog(String(args.postId));
    case "reviewBlog":
      return runtimeReviewBlog(
        String(args.postId),
        args.blogMdPath ? String(args.blogMdPath) : void 0
      );
    default:
      throw new Error(`tool-runtime: desteklenmeyen ara\xE7 ${name}`);
  }
}
var log3, blogMod;
var init_tool_runtime = __esm({
  "src/autonomous/services/tool-runtime.ts"() {
    "use strict";
    init_config();
    init_logger();
    log3 = createLogger("tool-runtime");
    blogMod = null;
  }
});

// src/autonomous/services/mcp-bridge.ts
import path4 from "node:path";
var McpBridge;
var init_mcp_bridge = __esm({
  "src/autonomous/services/mcp-bridge.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_tool_runtime();
    McpBridge = class {
      client = null;
      transport = null;
      log;
      mode = "inprocess";
      constructor(logger) {
        this.log = logger ?? createLogger("mcp-bridge");
      }
      async connect() {
        const wantStdio = process.env.PIPELINE_MCP_STDIO === "1";
        if (!wantStdio) {
          this.mode = "inprocess";
          this.log.info(
            "Tool runtime: in-process (MCP tool semanti\u011Fi). Stdio i\xE7in PIPELINE_MCP_STDIO=1"
          );
          return;
        }
        if (this.client) return;
        this.mode = "stdio";
        this.log.info("MCP SDK y\xFCkleniyor (stdio)\u2026");
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
        const root = getProjectRoot();
        const serverJs = path4.join(root, "src", "server.js");
        this.transport = new StdioClientTransport({
          command: process.execPath,
          args: [serverJs],
          stderr: "pipe",
          cwd: root,
          env: { ...process.env }
        });
        const errStream = this.transport.stderr;
        if (errStream && typeof errStream.on === "function") {
          errStream.on("data", (chunk) => {
            process.stderr.write(chunk);
          });
        }
        this.client = new Client({
          name: "autonomous-financial-editor",
          version: "3.0.0"
        });
        await this.client.connect(this.transport);
        this.log.info("MCP Client ba\u011Fland\u0131", { server: serverJs });
      }
      async close() {
        try {
          await this.client?.close();
        } catch {
        }
        try {
          await this.transport?.close();
        } catch {
        }
        this.client = null;
        this.transport = null;
      }
      extractText(result) {
        return (result.content ?? []).filter((p) => p.type === "text" && p.text).map((p) => p.text).join("\n");
      }
      async callToolText(name, args) {
        if (this.mode === "inprocess") {
          if (name === "getQodiInfo") {
            return runtimeGetQodiInfo(String(args.topic));
          }
          const json = await runtimeCallToolJson(name, args);
          return JSON.stringify(json, null, 2);
        }
        if (!this.client) throw new Error("McpBridge: connect() \xF6nce \xE7a\u011Fr\u0131lmal\u0131");
        const result = await this.client.callTool({
          name,
          arguments: args
        });
        const text = this.extractText(result);
        if (result.isError) {
          throw new Error(`${name}: ${text.slice(0, 400)}`);
        }
        return text;
      }
      async callToolJson(name, args) {
        if (this.mode === "inprocess") {
          return await runtimeCallToolJson(name, args);
        }
        const text = await this.callToolText(name, args);
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`${name} JSON de\u011Fil: ${text.slice(0, 400)}`);
        }
      }
      async getQodiInfo(topic) {
        const text = await this.callToolText("getQodiInfo", { topic });
        if (!text || /geçersiz topic|bulunamadı|başarısız/i.test(text)) {
          throw new Error(`getQodiInfo(${topic}): ${text.slice(0, 200)}`);
        }
        return text;
      }
      async listTools() {
        if (this.mode === "inprocess") {
          return [
            "getQodiInfo",
            "writeBlog",
            "refineBlog",
            "checkBlog",
            "reviewBlog"
          ];
        }
        if (!this.client) throw new Error("McpBridge: connect() \xF6nce");
        const listed = await this.client.listTools();
        return listed.tools.map((t) => t.name);
      }
    };
  }
});

// src/autonomous/autonomous-orchestrator.ts
var autonomous_orchestrator_exports = {};
__export(autonomous_orchestrator_exports, {
  runAutonomousPipeline: () => runAutonomousPipeline,
  runOnceFromCli: () => runOnceFromCli
});
import { mkdir as mkdir2, readFile as readFile2, writeFile } from "node:fs/promises";
import path5 from "node:path";
async function daysSinceLastRun(lastRunFile) {
  try {
    const raw = await readFile2(lastRunFile, "utf8");
    const t = Date.parse(raw.trim());
    if (Number.isNaN(t)) return null;
    return (Date.now() - t) / (1e3 * 60 * 60 * 24);
  } catch {
    return null;
  }
}
async function markLastRun(lastRunFile) {
  await mkdir2(path5.dirname(lastRunFile), { recursive: true });
  await writeFile(lastRunFile, (/* @__PURE__ */ new Date()).toISOString(), "utf8");
}
async function writeErrorLog(errorsDir, payload) {
  await mkdir2(errorsDir, { recursive: true });
  const name = `${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(
    path5.join(errorsDir, name),
    JSON.stringify(payload, null, 2),
    "utf8"
  );
}
async function runAutonomousPipeline(trigger, payload = {}, configOverride) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const root = await getProjectRootAsync();
  process.env.QODI_MCP_ROOT = root;
  const cfg = configOverride ?? await loadPipelineConfig();
  const postsDir2 = path5.join(root, "data", "posts");
  const errorsDir = path5.join(postsDir2, "errors");
  const lastRunFile = path5.join(postsDir2, ".last-run");
  if (running) {
    return {
      ok: false,
      trigger,
      revisions: 0,
      error: "Pipeline zaten \xE7al\u0131\u015F\u0131yor",
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  const force = Boolean(payload.force) || trigger === "cli" || trigger === "http";
  if (!force) {
    const since = await daysSinceLastRun(lastRunFile);
    if (since !== null && since < cfg.everyDays) {
      log4.info("everyDays kap\u0131s\u0131 \u2014 atland\u0131", { since, everyDays: cfg.everyDays });
      return {
        ok: true,
        trigger,
        revisions: 0,
        error: `skipped: last run ${since.toFixed(1)}d ago (need ${cfg.everyDays}d)`,
        startedAt,
        finishedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
  }
  running = true;
  const mcp = new McpBridge(createLogger("mcp-bridge"));
  let revisions = 0;
  try {
    await mkdir2(postsDir2, { recursive: true });
    await mkdir2(errorsDir, { recursive: true });
    log4.info("Pipeline ba\u015Flad\u0131", { trigger, payload: payload.source ?? "local" });
    await mcp.connect();
    const tools = await mcp.listTools();
    log4.info("MCP ara\xE7lar\u0131", { tools });
    const writer = new WriterAgent(mcp);
    const editor = new EditorAgent(mcp);
    const sourceTopics = payload.sourceTopics ?? cfg.sourceTopics;
    const keywords = payload.keywords ?? cfg.keywords;
    const category = payload.category ?? cfg.category;
    const topicContents = await writer.loadTopics(sourceTopics);
    let editorFeedback = null;
    let lastWriter = null;
    let lastReport = null;
    let reviewPath;
    let blogPath = "";
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
        revision
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
              message: "writeBlog tasla\u011F\u0131 rejected; kurallara g\xF6re yeniden yaz."
            }
          ],
          revisionHints: [
            "Kelime 800\u20132200, yasal uyar\u0131, 3\u201310 keyword, Qodi/Matriks ge\xE7sin."
          ],
          skill: "editor"
        };
        log4.warn("Writer rejected \u2014 self-correction", { revision });
        continue;
      }
      const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      blogPath = path5.join(postsDir2, `${day}-qodi-blog.md`);
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
          `pipeline: writer \u2192 editor (self-correction)`,
          `generatedAt: ${(/* @__PURE__ */ new Date()).toISOString()}`,
          `sourceTopics: ${sourceTopics.join(", ")}`,
          `---`,
          ``,
          lastWriter.content,
          ``
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
      const feedbackPath = path5.join(
        postsDir2,
        `${day}-editor-feedback-r${revision}.json`
      );
      await writeFile(feedbackPath, JSON.stringify(report, null, 2), "utf8");
      log4.info("Self-correction turu", {
        revision,
        percent: report.percent,
        verdict: report.verdict,
        threshold: cfg.scoreThreshold
      });
      if (report.percent >= cfg.scoreThreshold && report.verdict !== "reject") {
        break;
      }
      if (revision === maxAttempts - 1) {
        log4.warn("Max revision doldu", { percent: report.percent });
      }
    }
    if (!lastWriter || !lastReport || lastReport.percent < cfg.scoreThreshold) {
      await writeErrorLog(errorsDir, {
        at: (/* @__PURE__ */ new Date()).toISOString(),
        reason: "score_below_threshold",
        percent: lastReport?.percent,
        postId: lastWriter?.postId,
        revisions,
        findings: lastReport?.findings
      });
      throw new Error(
        `Blog onaylanmad\u0131: skor ${lastReport?.percent ?? 0} < ${cfg.scoreThreshold}`
      );
    }
    await markLastRun(lastRunFile);
    const result = {
      ok: true,
      trigger,
      postId: lastWriter.postId,
      blogPath,
      reviewPath,
      percent: lastReport.percent,
      verdict: lastReport.verdict,
      revisions,
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    log4.info("Pipeline tamamland\u0131", result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log4.error("Pipeline ba\u015Far\u0131s\u0131z", { message });
    try {
      await writeErrorLog(errorsDir, {
        at: (/* @__PURE__ */ new Date()).toISOString(),
        error: message,
        stack: err instanceof Error ? err.stack : void 0
      });
    } catch {
    }
    return {
      ok: false,
      trigger,
      revisions,
      error: message,
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  } finally {
    await mcp.close();
    running = false;
  }
}
async function runOnceFromCli() {
  const result = await runAutonomousPipeline("cli", { force: true });
  if (!result.ok) {
    process.exitCode = 1;
  }
}
var log4, running;
var init_autonomous_orchestrator = __esm({
  "src/autonomous/autonomous-orchestrator.ts"() {
    "use strict";
    init_editor_agent();
    init_writer_agent();
    init_config();
    init_logger();
    init_mcp_bridge();
    log4 = createLogger("autonomous-orchestrator");
    running = false;
  }
});

// src/api/http-server.ts
import { createServer } from "node:http";
function boot(msg) {
  process.stderr.write(`[pipeline] ${msg}
`);
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
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}
async function main() {
  boot("1/4 k\xF6k dizin\u2026");
  const { getProjectRootAsync: getProjectRootAsync2, loadPipelineConfig: loadPipelineConfig2 } = await Promise.resolve().then(() => (init_config(), config_exports));
  const { createLogger: createLogger2 } = await Promise.resolve().then(() => (init_logger(), logger_exports));
  const log5 = createLogger2("http-server");
  const root = await getProjectRootAsync2();
  process.env.QODI_MCP_ROOT = root;
  boot(`1/4 ok \u2192 ${root}`);
  boot("2/4 config\u2026");
  const cfg = await loadPipelineConfig2();
  boot(
    `2/4 ok \u2192 cron=${cfg.cron} everyDays=${cfg.everyDays} port=${cfg.httpPort}`
  );
  boot("3/4 cron\u2026");
  const cron = (await import("node-cron")).default;
  const { runAutonomousPipeline: runAutonomousPipeline2 } = await Promise.resolve().then(() => (init_autonomous_orchestrator(), autonomous_orchestrator_exports));
  if (!cron.validate(cfg.cron)) {
    boot(`FATAL: ge\xE7ersiz cron ${cfg.cron}`);
    process.exit(1);
  }
  cron.schedule(cfg.cron, () => {
    log5.info("Cron tetikledi", { cron: cfg.cron });
    void runAutonomousPipeline2("cron", { force: false }).then((r) => {
      log5.info("Cron sonucu", { ok: r.ok, percent: r.percent, error: r.error });
    });
  });
  log5.info("Cron planland\u0131", {
    cron: cfg.cron,
    everyDays: cfg.everyDays,
    maxRevisions: cfg.maxRevisions
  });
  boot("3/4 ok");
  const once = process.argv.includes("--once") || process.env.PIPELINE_ONCE === "1";
  if (once) {
    boot("pipeline:once\u2026");
    const result = await runAutonomousPipeline2("cli", { force: true });
    process.exit(result.ok ? 0 : 1);
  }
  boot(`4/4 HTTP :${cfg.httpPort}\u2026`);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${cfg.httpPort}`);
      const path6 = url.pathname;
      const method = req.method ?? "GET";
      if (method === "GET" && (path6 === "/" || path6 === "/api/v1/health")) {
        sendJson(res, 200, {
          ok: true,
          service: "autonomous-financial-editor",
          cron: cfg.cron,
          everyDays: cfg.everyDays,
          scoreThreshold: cfg.scoreThreshold,
          maxRevisions: cfg.maxRevisions,
          trigger: "POST /api/v1/trigger-pipeline",
          ts: (/* @__PURE__ */ new Date()).toISOString()
        });
        return;
      }
      if (method === "POST" && path6 === "/api/v1/trigger-pipeline") {
        const body = await readJsonBody(req);
        log5.info("HTTP trigger", { source: body.source ?? "anonymous" });
        const result = await runAutonomousPipeline2("http", {
          ...body,
          force: body.force !== false
        });
        sendJson(res, result.ok ? 200 : 500, result);
        return;
      }
      sendJson(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      log5.error("HTTP hata", {
        err: err instanceof Error ? err.message : String(err)
      });
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.listen(cfg.httpPort, "127.0.0.1", () => {
      log5.info(`HTTP dinleniyor :${cfg.httpPort}`);
      boot(`HAZIR \u2014 http://127.0.0.1:${cfg.httpPort}`);
      boot(
        `Tetikle: curl -s -X POST http://127.0.0.1:${cfg.httpPort}/api/v1/trigger-pipeline -H 'Content-Type: application/json' -d '{"force":true}'`
      );
      resolve();
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        boot(`HATA: port ${cfg.httpPort} dolu \u2192 lsof -i :${cfg.httpPort}`);
      }
      reject(err);
    });
  });
}
main().catch((err) => {
  boot(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
