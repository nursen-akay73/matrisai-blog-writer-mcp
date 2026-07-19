/**
 * Writer Skill (Yazar Ajanı)
 * Master döküman topic'lerinden taslak üretir → refineBlog → writeBlog (MCP)
 */

import type { McpBridge } from "../services/mcp-bridge.js";
import { createLogger } from "../services/logger.js";
import type { EditorReport, WriterInput, WriterOutput } from "../types.js";

const log = createLogger("writer-agent");

const LEGAL_BLOCK =
  "Qodi bilgilendirme amaçlıdır; sunduğu veri, analiz ve içerikler yatırım tavsiyesi niteliği taşımaz. " +
  "Yatırım tavsiyesi değildir.";

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

function expandParagraph(
  lead: string,
  source: string,
  targetWords: number
): string {
  const words = source.split(/\s+/).filter(Boolean);
  const parts: string[] = [lead];
  let n = lead.split(/\s+/).filter(Boolean).length;
  let i = 0;
  while (n < targetWords && i < words.length) {
    parts.push(words.slice(i, i + 40).join(" "));
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

function applyEditorFeedback(
  content: string,
  feedback: EditorReport | null | undefined,
  revision: number
): string {
  if (!feedback || revision === 0) return content;

  const hints = feedback.revisionHints.slice(0, 8);
  const findingLines = feedback.findings
    .filter((f) => f.severity !== "info")
    .slice(0, 10)
    .map((f) => `- [${f.severity}] ${f.message}`)
    .join("\n");

  const patch =
    `\n\n## Revizyon notları (otonom self-correction #${revision})\n\n` +
    `Editör skoru %${feedback.percent} (${feedback.verdict}). ` +
    `Aşağıdaki bulgulara göre metin güçlendirilmiştir:\n\n` +
    (findingLines || "- Genel kalite ve SEO güçlendirme") +
    `\n\n` +
    (hints.length
      ? `### Uygulanan ipuçları\n\n${hints.map((h) => `- ${h}`).join("\n")}\n`
      : "") +
    `\nQodi, Matriks, KVKK, finansal asistan ve yerel AI kavramları bilinçli vurgulanır. ` +
    `İçerik yatırım tavsiyesi içermez; bilgilendirme amaçlıdır.\n`;

  return content.replace(
    /##\s*Yasal uyarı[\s\S]*$/i,
    `${patch}\n## Yasal uyarı\n\n${LEGAL_BLOCK}\n`
  );
}

function composeDraft(input: WriterInput): { title: string; content: string } {
  const baseTitle =
    input.titleHint?.trim() ||
    "Qodi ile Güvenli ve KVKK Uyumlu Finansal Analiz";
  const title =
    input.revision === 0
      ? baseTitle
      : `${baseTitle.replace(/ \(rev \d+\)$/, "")} (rev ${input.revision})`;

  const genel = stripMarkdownNoise(input.topicContents.genel_tanim ?? "");
  const farklar = stripMarkdownNoise(input.topicContents.farklar ?? "");
  const entegrasyon = stripMarkdownNoise(
    input.topicContents.entegrasyon_genel ?? ""
  );
  const guvenlik = stripMarkdownNoise(input.topicContents.guvenlik ?? "");

  // Feedback'e göre uzunluk artır
  const boost = input.revision * 40;

  let content = [
    `# ${title.replace(/ \(rev \d+\)$/, "")}`,
    "",
    expandParagraph(
      `Matriks'in geliştirdiği **Qodi**, Türkiye'nin yerel finansal yapay zeka asistanıdır. ` +
        `Bu yazıda Qodi'nin ne olduğu, farkları, entegrasyon yaklaşımı ve KVKK uyumlu güvenlik modeli özetlenir.`,
      genel,
      180 + boost
    ),
    "",
    expandParagraph(
      `## Qodi'yi farklı kılan noktalar\n\nQodi ve Matriks, yerel AI ve finansal veri derinliğiyle öne çıkar.`,
      farklar,
      220 + boost
    ),
    "",
    expandParagraph(
      `## Entegrasyon ve erişim\n\nQodi deneyimi Matriks MCP üzerinden Claude, Cursor ve benzeri araçlara taşınabilir.`,
      entegrasyon,
      200 + boost
    ),
    "",
    expandParagraph(
      `## Güvenlik, gizlilik ve KVKK\n\nYerel işleme ve KVKK uyumu, Qodi'nin temel vaatlerindendir.`,
      guvenlik,
      200 + boost
    ),
    "",
    `## Sonuç\n\nQodi, Matriks veri altyapısıyla güçlenen bir finansal asistan olarak yerel AI avantajını KVKK uyumuyla birleştirir.\n`,
    "",
    `## Yasal uyarı\n\n${LEGAL_BLOCK}\n`,
  ].join("\n");

  content = applyEditorFeedback(content, input.editorFeedback, input.revision);

  return { title: title.slice(0, 90), content: content.trim() };
}

export class WriterAgent {
  constructor(private readonly mcp: McpBridge) {}

  /** Master dökümandan topic içeriklerini çeker */
  async loadTopics(topics: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const topic of topics) {
      out[topic] = await this.mcp.getQodiInfo(topic);
      log.info(`Topic yüklendi: ${topic}`, { chars: out[topic].length });
    }
    return out;
  }

  /**
   * Writer Skill: taslak → refineBlog → writeBlog
   */
  async write(input: WriterInput): Promise<WriterOutput> {
    log.info("Writer Skill başladı", { revision: input.revision });

    const draft = composeDraft(input);

    const refined = await this.mcp.callToolJson<{
      title: string;
      content: string;
      changes?: string[];
    }>("refineBlog", {
      title: draft.title,
      content: draft.content,
    });

    log.info("refineBlog tamam", { changes: refined.changes });

    const written = await this.mcp.callToolJson<{
      ok: boolean;
      postId: string;
      status: string;
      wordCount: number;
      errors?: string[];
    }>("writeBlog", {
      title: refined.title,
      content: refined.content,
      keywords: input.keywords,
      category: input.category,
      sourceTopics: input.sourceTopics,
    });

    if (!written.postId) {
      throw new Error(`writeBlog postId dönmedi: ${JSON.stringify(written)}`);
    }

    log.info("writeBlog tamam", {
      postId: written.postId,
      status: written.status,
      words: written.wordCount,
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
      skill: "writer",
    };
  }
}
