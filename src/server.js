/**
 * Qodi Bilgi + Blog MCP Sunucusu (v2.2)
 *
 * Araçlar: getQodiInfo, writeBlog, refineBlog, checkBlog, reviewBlog
 * Claude Desktop uyumu: SDK 1.12.x + server.tool()
 */

console.error("[qodi-mcp] boot…");

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  CATEGORIES,
  MAX_WORDS,
  MIN_WORDS,
  checkBlogQuality,
  ensurePostsDir,
  loadPost,
  refineBlog,
  runMatriksChecklist,
  updatePostContent,
  writeBlog,
  writeReviewMarkdown,
} from "./blog.js";

console.error("[qodi-mcp] import tamam");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(   
  __dirname,
  "..",
  "data",
  "qodi-bilgi-dosyasi-v2.md"
);
const POSTS_DIR = path.join(__dirname, "..", "data", "posts");
const REVIEWS_DIR = path.join(__dirname, "..", "data", "reviews");

const TOPIC_COMMENT_RE = /<!--\s*topic:\s*([a-z0-9_]+)\s*-->/i;
const HEADING_RE = /^#{2,3}\s+/;

/**
 * @param {string} markdown
 * @returns {Array<{ topic: string, section: string, scope: string }>}
 */
function parseTopicTable(markdown) {
  const lines = markdown.split(/\r?\n/);
  const startIdx = lines.findIndex((line) =>
    /^##\s+0\.\s+Topic Eşleştirme Tablosu/i.test(line)
  );

  if (startIdx === -1) {
    throw new Error(
      'Bilgi dosyasında "## 0. Topic Eşleştirme Tablosu" başlığı bulunamadı.'
    );
  }

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  const entries = [];
  const rowRe =
    /^\|\s*`([a-z0-9_]+)`\s*\|\s*([^|]*)\|\s*(.*?)\s*\|\s*$/i;

  for (let i = startIdx + 1; i < endIdx; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) continue;
    if (/^\|[\s|:-]+\|$/.test(line)) continue;
    if (/topic/i.test(line) && /Bölüm/i.test(line)) continue;

    const match = line.match(rowRe);
    if (!match) continue;

    entries.push({
      topic: match[1],
      section: match[2].trim(),
      scope: match[3].trim(),
    });
  }

  if (entries.length === 0) {
    throw new Error(
      "Topic eşleştirme tablosundan hiç topic satırı okunamadı. Tablo formatını kontrol edin."
    );
  }

  return entries;
}

/**
 * @param {string} markdown
 * @returns {Map<string, string>}
 */
function parseTopicChunks(markdown) {
  const lines = markdown.split(/\r?\n/);
  /** @type {Array<{ topic: string, commentLine: number }>} */
  const markers = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(TOPIC_COMMENT_RE);
    if (match) {
      markers.push({ topic: match[1], commentLine: i });
    }
  }

  const byTopic = new Map();

  for (let m = 0; m < markers.length; m++) {
    const { topic, commentLine } = markers[m];
    const nextCommentLine =
      m + 1 < markers.length ? markers[m + 1].commentLine : lines.length;

    let start = commentLine + 1;
    let end = nextCommentLine;

    if (m + 1 < markers.length) {
      let j = nextCommentLine - 1;
      while (j >= start && lines[j].trim() === "") j--;
      if (j >= start && HEADING_RE.test(lines[j])) {
        end = j;
        while (end > start && lines[end - 1].trim() === "") end--;
      }
    }

    const bodyLines = lines.slice(start, end);
    const headingLines = [];
    let h = commentLine - 1;
    while (h >= 0 && lines[h].trim() === "") h--;
    if (h >= 0 && HEADING_RE.test(lines[h])) {
      headingLines.push(lines[h]);
    }

    byTopic.set(topic, [...headingLines, ...bodyLines].join("\n").trim());
  }

  return byTopic;
}

/**
 * @returns {Promise<{
 *   topics: string[],
 *   catalog: Array<{ topic: string, section: string, scope: string }>,
 *   byTopic: Map<string, string>
 * }>}
 */
async function loadKnowledge() {
  let markdown;
  try {
    markdown = await readFile(DATA_FILE, "utf8");
  } catch (err) {
    const reason = err?.code === "ENOENT" ? "dosya bulunamadı" : err.message;
    throw new Error(
      `Qodi bilgi dosyası okunamadı (${reason}). Beklenen yol: ${DATA_FILE}`
    );
  }

  if (!markdown.trim()) {
    throw new Error(`Qodi bilgi dosyası boş: ${DATA_FILE}`);
  }

  const catalog = parseTopicTable(markdown);
  const topics = catalog.map((e) => e.topic);
  const chunks = parseTopicChunks(markdown);
  const byTopic = new Map();

  for (const entry of catalog) {
    const { topic } = entry;

    if (topic === "tam_metin") {
      byTopic.set(topic, markdown.trim());
      continue;
    }

    const content = chunks.get(topic);
    if (content === undefined || content === "") {
      console.error(
        `[qodi-mcp] Uyarı: Tabloda "${topic}" var ama dosyada <!-- topic: ${topic} --> bulunamadı (veya içerik boş).`
      );
      continue;
    }
    byTopic.set(topic, content);
  }

  for (const [topic] of chunks) {
    if (!topics.includes(topic)) {
      console.error(
        `[qodi-mcp] Uyarı: Dosyada <!-- topic: ${topic} --> var ama Bölüm 0 tablosunda yok; yok sayıldı.`
      );
    }
  }

  console.error(
    `[qodi-mcp] Yüklendi: ${topics.length} topic, ${byTopic.size} içerik (${DATA_FILE})`
  );

  return { topics, catalog, byTopic };
}

function errorResult(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function jsonResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

/**
 * @param {Array<{ topic: string, section: string, scope: string }>} catalog
 */
function buildInfoToolDescription(catalog) {
  const lines = catalog.map(
    (e) => `- ${e.topic} (Bölüm ${e.section}): ${e.scope}`
  );
  return (
    "Qodi ve Matriks MCP hakkında konu bazlı referans metni döndürür. " +
    "Blog yazmadan ÖNCE ilgili topic'leri buradan çekin; metni siz (LLM) yazın, " +
    "sonra writeBlog ile kaydedin. Geçerli topic'ler:\n" +
    lines.join("\n")
  );
}

async function main() {
  const { topics, catalog, byTopic } = await loadKnowledge();
  await ensurePostsDir(POSTS_DIR);

  const topicEnum = z.enum(/** @type {[string, ...string[]]} */ (topics));
  const categoryEnum = z.enum(
    /** @type {[string, ...string[]]} */ (CATEGORIES)
  );

  const server = new McpServer({
    name: "qodi-bilgi-yerel",
    version: "2.2.0",
  });

  // SDK 1.12.x uyumlu API: server.tool(name, description, schema, handler)
  server.tool(
    "getQodiInfo",
    buildInfoToolDescription(catalog),
    {
      topic: topicEnum.describe(
        "İstenen bilgi konusu. Değerler Bölüm 0 tablosundan türetilir."
      ),
    },
    async ({ topic }) => {
      if (!topics.includes(topic)) {
        return errorResult(
          `Geçersiz topic: "${topic}". Geçerli topic'ler: ${topics.join(", ")}`
        );
      }

      const content = byTopic.get(topic);
      if (!content) {
        return errorResult(
          `Topic "${topic}" tabloda tanımlı ancak içerik yüklenemedi. ` +
            `Geçerli ve içerikli topic'ler: ${[...byTopic.keys()].join(", ")}`
        );
      }

      return { content: [{ type: "text", text: content }] };
    }
  );

  server.tool(
    "writeBlog",
    "LLM'in ürettiği MatriksAI / Qodi blog yazısını kaydeder ve kural kapısından geçirir. " +
      `ÖNCE getQodiInfo ile kaynak çekin; metni siz yazın; sonra bu aracı çağırın. ` +
      `Kurallar: ${MIN_WORDS}–${MAX_WORDS} kelime, yasal uyarı ("yatırım tavsiyesi değildir"), ` +
      `3–10 SEO anahtar kelimesi, kategori (${CATEGORIES.join(" | ")}). ` +
      "Dönen postId ile checkBlog çağırın.",
    {
      title: z.string().min(1).describe("Blog başlığı (öneri 30–90 karakter)"),
      content: z
        .string()
        .min(1)
        .describe(
          `Tam markdown içerik (${MIN_WORDS}–${MAX_WORDS} kelime; yasal uyarı zorunlu)`
        ),
      keywords: z
        .array(z.string())
        .min(1)
        .describe("SEO anahtar kelimeleri (3–10)"),
      category: categoryEnum.describe("İçerik kategorisi"),
      sourceTopics: z
        .array(topicEnum)
        .optional()
        .describe("Yazıda kullanılan getQodiInfo topic'leri"),
    },
    async ({ title, content, keywords, category, sourceTopics }) => {
      try {
        const { record, filePath } = await writeBlog(POSTS_DIR, {
          title,
          content,
          keywords,
          category,
          sourceTopics,
        });

        return jsonResult({
          ok: record.status !== "rejected",
          postId: record.id,
          status: record.status,
          wordCount: record.wordCount,
          errors: record.errors,
          warnings: record.warnings,
          savedTo: filePath,
          nextStep:
            record.status === "rejected"
              ? "Hataları düzeltip writeBlog'u yeniden çağırın."
              : "checkBlog ile kalite skorunu alın (postId kullanın).",
        });
      } catch (err) {
        return errorResult(`writeBlog başarısız: ${err.message ?? err}`);
      }
    }
  );

  server.tool(
    "refineBlog",
    "Brand Refiner: taslak veya kayıtlı yazıyı Matriks kurumsal tonu, doğru ürün konumlandırması " +
      "ve yasal uyarı kurallarına göre özelleştirir. postId verilirse kayıt güncellenir; " +
      "yalnızca title+content verilirse refined metin döner (henüz kaydetmez).",
    {
      postId: z
        .string()
        .optional()
        .describe("Varsa bu post refine edilip kayda yazılır"),
      title: z.string().optional().describe("postId yoksa zorunlu"),
      content: z.string().optional().describe("postId yoksa zorunlu"),
    },
    async ({ postId, title, content }) => {
      try {
        let baseTitle = title;
        let baseContent = content;

        if (postId) {
          const loaded = await loadPost(POSTS_DIR, postId);
          if (!loaded) {
            return errorResult(`postId bulunamadı: "${postId}"`);
          }
          baseTitle = loaded.post.title;
          baseContent = loaded.post.content;
        }

        if (!baseTitle || !baseContent) {
          return errorResult("refineBlog: postId veya title+content gerekli.");
        }

        const refined = refineBlog({
          title: baseTitle,
          content: baseContent,
        });

        let saved = null;
        if (postId) {
          saved = await updatePostContent(POSTS_DIR, postId, refined);
        }

        return jsonResult({
          ok: true,
          postId: postId ?? null,
          title: refined.title,
          content: refined.content,
          changes: refined.changes,
          skill: refined.skill,
          updated: Boolean(saved),
          nextStep: postId
            ? "reviewBlog veya checkBlog çağırın."
            : "writeBlog ile kaydedin, sonra reviewBlog.",
        });
      } catch (err) {
        return errorResult(`refineBlog başarısız: ${err.message ?? err}`);
      }
    }
  );

  server.tool(
    "checkBlog",
    "writeBlog ile kaydedilmiş bir yazıyı yapı, yasal uyarı, marka/ton ve SEO açısından skorlar. " +
      "postId zorunlu. verdict: ready | needs_revision | reject.",
    {
      postId: z.string().min(1).describe("writeBlog'un döndürdüğü postId"),
    },
    async ({ postId }) => {
      try {
        const loaded = await loadPost(POSTS_DIR, postId);
        if (!loaded) {
          return errorResult(
            `postId bulunamadı: "${postId}". Önce writeBlog çağırın.`
          );
        }

        const report = checkBlogQuality(loaded.post);
        return jsonResult({
          postId: loaded.post.id,
          title: loaded.post.title,
          previousStatus: loaded.post.status,
          ...report,
        });
      } catch (err) {
        return errorResult(`checkBlog başarısız: ${err.message ?? err}`);
      }
    }
  );

  server.tool(
    "reviewBlog",
    "checkBlog skoru + Matriks checklist ile kontrol eder; sonucu ayrı bir markdown dosyasına yazar " +
      "(data/reviews/YYYY-MM-DD-review.md). Blog dosyası yolu opsiyonel.",
    {
      postId: z.string().min(1).describe("writeBlog postId"),
      blogMdPath: z
        .string()
        .optional()
        .describe("İlgili blog .md yolu (raporda referans)"),
    },
    async ({ postId, blogMdPath }) => {
      try {
        const loaded = await loadPost(POSTS_DIR, postId);
        if (!loaded) {
          return errorResult(`postId bulunamadı: "${postId}"`);
        }

        const quality = checkBlogQuality(loaded.post);
        const checklist = runMatriksChecklist(loaded.post);
        const { filePath, day } = await writeReviewMarkdown(REVIEWS_DIR, {
          post: loaded.post,
          quality,
          checklist,
          blogMdPath,
        });

        return jsonResult({
          ok: true,
          postId: loaded.post.id,
          reviewPath: filePath,
          day,
          percent: quality.percent,
          verdict: quality.verdict,
          checklistSummary: checklist.summary,
        });
      } catch (err) {
        return errorResult(`reviewBlog başarısız: ${err.message ?? err}`);
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "[qodi-mcp] stdio dinleniyor — getQodiInfo, writeBlog, refineBlog, checkBlog, reviewBlog hazır."
  );
}

main().catch((err) => {
  console.error("[qodi-mcp] Fatal hata:", err.message ?? err);
  process.exit(1);
});
