/**
 * Editor Skill (Editör Ajanı)
 * Bağımsız kalite / SPK-yasal / SEO denetimi → JSON EditorReport
 * MCP: checkBlog + reviewBlog
 */

import type { McpBridge } from "../services/mcp-bridge.js";
import { createLogger } from "../services/logger.js";
import type { EditorFinding, EditorReport } from "../types.js";

const log = createLogger("editor-agent");

type CheckBlogPayload = {
  postId: string;
  percent: number;
  score: number;
  maxScore: number;
  verdict: string;
  notes?: string[];
  dimensions?: Array<{
    area: string;
    score: number;
    max: number;
    notes: string[];
  }>;
  checklist?: Record<string, unknown>;
};

type ReviewBlogPayload = {
  reviewPath: string;
  percent: number;
  verdict: string;
  checklistSummary?: {
    pass: number;
    fail: number;
    warn: number;
    total: number;
  };
};

function buildFindings(check: CheckBlogPayload): EditorFinding[] {
  const findings: EditorFinding[] = [];

  for (const note of check.notes ?? []) {
    const severity: EditorFinding["severity"] =
      /eksik|yok|düşük|red|reject/i.test(note) ? "error" : "warning";
    findings.push({
      code: "CHECK_NOTE",
      severity,
      message: note,
    });
  }

  for (const dim of check.dimensions ?? []) {
    if (dim.score < dim.max * 0.8) {
      for (const n of dim.notes) {
        findings.push({
          code: `DIM_${dim.area}`.toUpperCase(),
          severity: dim.score < dim.max * 0.5 ? "error" : "warning",
          message: n,
          area: dim.area,
        });
      }
    }
  }

  // SPK / yasal sinyal
  const legalWeak = findings.some(
    (f) => /yasal|tavsiye|uyarı/i.test(f.message)
  );
  if (legalWeak) {
    findings.push({
      code: "SPK_LEGAL",
      severity: "error",
      message:
        "Yasal/SPK uyumu zayıf: 'yatırım tavsiyesi değildir' ve bilgilendirme dili zorunlu.",
      area: "yasal_uyumluluk",
    });
  }

  if (findings.length === 0 && check.percent < 100) {
    findings.push({
      code: "GENERIC_QUALITY",
      severity: "warning",
      message: `Kalite %${check.percent}; yapı, SEO ve marka vurgularını güçlendirin.`,
    });
  }

  return findings;
}

function buildRevisionHints(findings: EditorFinding[], percent: number): string[] {
  const hints = new Set<string>();

  for (const f of findings) {
    if (/yasal|tavsiye/i.test(f.message)) {
      hints.add(
        "Yasal uyarı bölümünü güçlendir: bilgilendirme amaçlıdır; yatırım tavsiyesi değildir."
      );
    }
    if (/kelime|uzunluk|yapi/i.test(f.message + (f.area ?? ""))) {
      hints.add("Kelime sayısını 800–2200 aralığına çek; en az 3 ## alt başlık kullan.");
    }
    if (/seo|anahtar/i.test(f.message + (f.area ?? ""))) {
      hints.add(
        "SEO anahtar kelimelerini (Qodi, Matriks, KVKK, finansal asistan, yerel AI) metinde doğal geçir."
      );
    }
    if (/qodi|matriks|marka|kvkk/i.test(f.message)) {
      hints.add("Marka tonu: Qodi + Matriks geçsin; KVKK/yerel işleme vurgula.");
    }
    if (/quantex|konum/i.test(f.message)) {
      hints.add(
        "Ürün rolleri: Qodi sohbet asistanı, MCP köprü, Quantex kantitatif — karıştırma."
      );
    }
  }

  if (percent < 80) {
    hints.add(
      "Skor eşiğinin altında: sonuç + yasal uyarı bölümlerini netleştir, abartılı iddia kullanma."
    );
  }

  return [...hints];
}

export class EditorAgent {
  constructor(private readonly mcp: McpBridge) {}

  /**
   * Editor Skill: checkBlog → bulgular JSON → reviewBlog (ayrı MD)
   */
  async review(postId: string, blogMdPath?: string): Promise<{
    report: EditorReport;
    reviewPath?: string;
  }> {
    log.info("Editor Skill başladı", { postId });

    const check = await this.mcp.callToolJson<CheckBlogPayload>("checkBlog", {
      postId,
    });

    const findings = buildFindings(check);
    const percent = check.percent;
    const verdict =
      check.verdict === "ready" ||
      check.verdict === "needs_revision" ||
      check.verdict === "reject"
        ? check.verdict
        : percent >= 80
          ? "ready"
          : percent < 50
            ? "reject"
            : "needs_revision";

    let reviewPath: string | undefined;
    let checklistSummary: EditorReport["checklistSummary"];

    try {
      const review = await this.mcp.callToolJson<ReviewBlogPayload>(
        "reviewBlog",
        {
          postId,
          blogMdPath,
        }
      );
      reviewPath = review.reviewPath;
      checklistSummary = review.checklistSummary;
    } catch (err) {
      log.warn("reviewBlog başarısız; checkBlog ile devam", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    const report: EditorReport = {
      postId,
      score: check.score,
      maxScore: check.maxScore,
      percent,
      verdict,
      findings,
      checklistSummary,
      revisionHints: buildRevisionHints(findings, percent),
      skill: "editor",
    };

    log.info("Editor Skill tamam", {
      percent: report.percent,
      verdict: report.verdict,
      findings: report.findings.length,
      reviewPath,
    });

    return { report, reviewPath };
  }
}
