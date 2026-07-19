/**
 * Blog yazma / kontrol yardımcıları.
 *
 * writeBlog   → yazıyı kaydeder + kural kapısı
 * refineBlog  → Brand Refiner (kurumsal ton / konumlandırma)
 * checkBlog   → skor
 * reviewBlog  → checkBlog + Matriks checklist → ayrı review MD
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CATEGORIES = ["AI", "Teknoloji", "Finansal", "Güvenlik"];
const MIN_WORDS = 800;
const MAX_WORDS = 2200;
const TITLE_MIN = 30;
const TITLE_MAX = 90;
const KEYWORD_MIN = 3;
const KEYWORD_MAX = 10;

/** Yazıda aranan zorunlu / önerilen sinyaller */
const LEGAL_PATTERNS = [
  /yat[ıi]r[ıi]m tavsiyesi de[ğg]ildir/i,
  /yat[ıi]r[ıi]m tavsiyesi niteli[ğg]i ta[şs][ıi]maz/i,
  /bilgilendirme ama[çc]l[ıi]d[ıi]r/i,
];

const BRAND_PATTERNS = [/qodi/i, /matriks/i];

const FORBIDDEN_COMING_SOON_AS_LIVE = [
  {
    re: /portföy optimizasyonu.{0,40}(mevcut|kullanılabilir|şimdi|canlı)/i,
    tip: '"Portföy Optimizasyonu" yakında gelecek; mevcut özellik gibi sunulmamalı.',
  },
];

/**
 * @param {string} postsDir
 */
export async function ensurePostsDir(postsDir) {
  await mkdir(postsDir, { recursive: true });
}

/**
 * @param {string} text
 */
export function countWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * @param {string} title
 */
function slugify(title) {
  return title
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "yazi";
}

/**
 * writeBlog öncesi / sonrası kural kontrolü.
 * @param {{ title: string, content: string, keywords: string[], category: string }} post
 */
export function validateBlogDraft(post) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  const { title, content, keywords, category } = post;
  const wordCount = countWords(content || "");

  if (!title?.trim()) errors.push("title zorunlu.");
  else {
    if (title.length < TITLE_MIN) {
      warnings.push(
        `Başlık kısa (${title.length} karakter). Öneri: ${TITLE_MIN}–${TITLE_MAX}.`
      );
    }
    if (title.length > TITLE_MAX) {
      warnings.push(
        `Başlık uzun (${title.length} karakter). Öneri: ${TITLE_MIN}–${TITLE_MAX}.`
      );
    }
  }

  if (!content?.trim()) errors.push("content zorunlu.");
  else {
    if (wordCount < MIN_WORDS) {
      errors.push(
        `Kelime sayısı yetersiz (${wordCount}). Minimum ${MIN_WORDS} kelime.`
      );
    } else if (wordCount > MAX_WORDS) {
      warnings.push(
        `Kelime sayısı yüksek (${wordCount}). Öneri üst sınır ~${MAX_WORDS}.`
      );
    }
  }

  if (!Array.isArray(keywords) || keywords.length < KEYWORD_MIN) {
    errors.push(`En az ${KEYWORD_MIN} SEO anahtar kelimesi gerekli.`);
  } else if (keywords.length > KEYWORD_MAX) {
    warnings.push(`Anahtar kelime sayısı fazla (${keywords.length}). Öneri: ${KEYWORD_MIN}–${KEYWORD_MAX}.`);
  }

  if (!CATEGORIES.includes(category)) {
    errors.push(`category geçersiz. Geçerli: ${CATEGORIES.join(", ")}`);
  }

  if (content && !LEGAL_PATTERNS.some((re) => re.test(content))) {
    errors.push(
      'Yasal uyarı eksik: metinde "yatırım tavsiyesi değildir" / "bilgilendirme amaçlıdır" ifadesi olmalı.'
    );
  }

  if (content && !BRAND_PATTERNS.some((re) => re.test(content))) {
    warnings.push("Metinde Qodi veya Matriks geçmiyor; marka vurgusu zayıf olabilir.");
  }

  for (const rule of FORBIDDEN_COMING_SOON_AS_LIVE) {
    if (content && rule.re.test(content)) warnings.push(rule.tip);
  }

  // Basit yapı: en az bir markdown ## başlık
  if (content && !/^##\s+/m.test(content) && !/^#\s+/m.test(content)) {
    warnings.push("İçerikte markdown başlık (# / ##) yok; okunabilirlik için bölümleyin.");
  }

  const status =
    errors.length > 0
      ? "rejected"
      : warnings.length > 0
        ? "needs_revision"
        : "accepted";

  return { status, errors, warnings, wordCount };
}

/**
 * @param {string} postsDir
 * @param {{ title: string, content: string, keywords: string[], category: string, sourceTopics?: string[] }} input
 */
export async function writeBlog(postsDir, input) {
  await ensurePostsDir(postsDir);

  const validation = validateBlogDraft(input);
  const now = new Date().toISOString();
  const id = `${Date.now()}-${slugify(input.title)}`;

  const record = {
    id,
    title: input.title.trim(),
    content: input.content.trim(),
    keywords: input.keywords.map((k) => String(k).trim()).filter(Boolean),
    category: input.category,
    sourceTopics: input.sourceTopics ?? [],
    wordCount: validation.wordCount,
    status: validation.status,
    errors: validation.errors,
    warnings: validation.warnings,
    createdAt: now,
    updatedAt: now,
  };

  // rejected olsa bile kaydet — LLM düzeltip checkBlog / yeniden writeBlog yapabilsin
  const filePath = path.join(postsDir, `${id}.json`);
  await writeFile(filePath, JSON.stringify(record, null, 2), "utf8");

  return { record, filePath };
}

/**
 * @param {string} postsDir
 * @param {string} postId
 */
export async function loadPost(postsDir, postId) {
  const safe = path.basename(postId.replace(/\.json$/i, ""));
  const filePath = path.join(postsDir, `${safe}.json`);
  try {
    const raw = await readFile(filePath, "utf8");
    return { post: JSON.parse(raw), filePath };
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Kayıtlı yazı için detaylı kalite / SEO skoru.
 * @param {{ title: string, content: string, keywords: string[], category: string }} post
 */
export function checkBlogQuality(post) {
  const { title, content, keywords } = post;
  const wordCount = countWords(content || "");
  /** @type {Array<{ area: string, score: number, max: number, notes: string[] }>} */
  const dimensions = [];

  // 1) Yapı / uzunluk (0–25)
  {
    const notes = [];
    let score = 0;
    if (wordCount >= MIN_WORDS && wordCount <= MAX_WORDS) {
      score += 15;
    } else if (wordCount >= MIN_WORDS * 0.7) {
      score += 8;
      notes.push(`Kelime sayısı ${wordCount}; hedef ${MIN_WORDS}–${MAX_WORDS}.`);
    } else {
      notes.push(`Kelime sayısı çok düşük: ${wordCount}.`);
    }
    if (/^##\s+/m.test(content)) {
      score += 10;
    } else {
      notes.push("## alt başlık yok.");
    }
    dimensions.push({ area: "yapi_uzunluk", score, max: 25, notes });
  }

  // 2) Yasal / uyumluluk (0–25)
  {
    const notes = [];
    let score = 0;
    if (LEGAL_PATTERNS.some((re) => re.test(content))) {
      score += 20;
    } else {
      notes.push("Yasal uyarı cümlesi eksik.");
    }
    let comingSoonHit = false;
    for (const rule of FORBIDDEN_COMING_SOON_AS_LIVE) {
      if (rule.re.test(content)) {
        comingSoonHit = true;
        notes.push(rule.tip);
      }
    }
    if (!comingSoonHit) score += 5;
    dimensions.push({ area: "yasal_uyumluluk", score, max: 25, notes });
  }

  // 3) Marka / ton (0–20)
  {
    const notes = [];
    let score = 0;
    if (/qodi/i.test(content)) score += 10;
    else notes.push("Qodi adı geçmiyor.");
    if (/matriks/i.test(content)) score += 5;
    else notes.push("Matriks adı geçmiyor.");
    if (/kvkk|yerel|güvenli|güvenlik/i.test(content)) score += 5;
    else notes.push("KVKK / yerel / güvenlik vurgusu zayıf.");
    dimensions.push({ area: "marka_ton", score, max: 20, notes });
  }

  // 4) SEO (0–30) — keywords alanına göre
  {
    const notes = [];
    let score = 0;
    const kw = Array.isArray(keywords) ? keywords : [];
    if (kw.length >= KEYWORD_MIN && kw.length <= KEYWORD_MAX) score += 8;
    else notes.push(`Anahtar kelime sayısı: ${kw.length} (öneri ${KEYWORD_MIN}–${KEYWORD_MAX}).`);

    const haystack = `${title}\n${content}`.toLocaleLowerCase("tr-TR");
    let hits = 0;
    for (const k of kw) {
      if (haystack.includes(String(k).toLocaleLowerCase("tr-TR"))) hits++;
    }
    if (kw.length > 0) {
      const ratio = hits / kw.length;
      score += Math.round(ratio * 15);
      if (ratio < 0.5) {
        notes.push(
          `Anahtar kelimelerin yalnızca ${hits}/${kw.length} tanesi metinde geçiyor.`
        );
      }
    }
    if (title.length >= TITLE_MIN && title.length <= TITLE_MAX) score += 7;
    else notes.push(`Başlık uzunluğu ${title.length}; öneri ${TITLE_MIN}–${TITLE_MAX}.`);

    dimensions.push({ area: "seo", score: Math.min(score, 30), max: 30, notes });
  }

  const total = dimensions.reduce((s, d) => s + d.score, 0);
  const maxTotal = dimensions.reduce((s, d) => s + d.max, 0);
  const percent = Math.round((total / maxTotal) * 100);

  let verdict = "needs_revision";
  if (percent >= 80) verdict = "ready";
  else if (percent < 50) verdict = "reject";

  const allNotes = dimensions.flatMap((d) =>
    d.notes.map((n) => `[${d.area}] ${n}`)
  );

  return {
    wordCount,
    score: total,
    maxScore: maxTotal,
    percent,
    verdict,
    dimensions,
    notes: allNotes,
    checklist: {
      hasLegalDisclaimer: LEGAL_PATTERNS.some((re) => re.test(content)),
      mentionsQodi: /qodi/i.test(content),
      mentionsMatriks: /matriks/i.test(content),
      hasHeadings: /^##\s+/m.test(content) || /^#\s+/m.test(content),
      keywordCoverage:
        keywords?.length > 0
          ? keywords.filter((k) =>
              `${title}\n${content}`
                .toLocaleLowerCase("tr-TR")
                .includes(String(k).toLocaleLowerCase("tr-TR"))
            ).length / keywords.length
          : 0,
    },
  };
}

/**
 * @param {string} postsDir
 */
export async function listPosts(postsDir) {
  await ensurePostsDir(postsDir);
  const files = await readdir(postsDir);
  const ids = files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/i, ""));
  return ids;
}

const LEGAL_BLOCK =
  "Qodi bilgilendirme amaçlıdır; sunduğu veri, analiz ve içerikler yatırım tavsiyesi niteliği taşımaz. " +
  "Yatırım tavsiyesi değildir.";

const ECOSYSTEM_BLOCK =
  "Matriks AI ekosisteminde **Qodi** kullanıcıyla sohbet eden finansal asistan, " +
  "**Matriks MCP** bu deneyimi Claude / ChatGPT / Cursor gibi araçlara taşıyan köprü, " +
  "**Quantex** ise kantitatif analiz ve sinyal platformudur. Bu ürünler birbirinin yerine geçmez; tamamlar.";

/**
 * Brand Refiner — taslağı Matriks tonuna ve doğru konumlandırmaya çeker.
 * @param {{ title: string, content: string, keywords?: string[] }} input
 */
export function refineBlog(input) {
  let title = String(input.title || "").trim();
  let content = String(input.content || "").trim();
  /** @type {string[]} */
  const changes = [];

  // Clickbait yumuşatma
  const beforeTitle = title;
  title = title
    .replace(/#\s*1\b/gi, "")
    .replace(/garantili|muhteşem|devrim/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (title !== beforeTitle) changes.push("Başlıktan abartılı ifade temizlendi.");

  // Ekosistem konumu
  if (!/matriks mcp/i.test(content) || !/quantex/i.test(content)) {
    if (!/ekosistem/i.test(content)) {
      content = content.replace(
        /(##\s+[^\n]+\n)/,
        `$1\n${ECOSYSTEM_BLOCK}\n\n`
      );
      changes.push("Ekosistem konumlandırma paragrafı eklendi.");
    }
  } else if (!/birbirinin yerine geçmez|tamamlar/i.test(content)) {
    content += `\n\n## Ekosistem notu\n\n${ECOSYSTEM_BLOCK}\n`;
    changes.push("Ekosistem netleştirme notu eklendi.");
  }

  // Qodi/Quantex karışıklığına karşı yumuşak uyarı (metin ekleme)
  if (/qodi.{0,40}kantitatif|quantex.{0,40}sohbet asistan/i.test(content)) {
    content +=
      "\n\n> Not: Qodi sohbet asistanı; Quantex kantitatif platformdur — roller karıştırılmamalıdır.\n";
    changes.push("Ürün rolü uyarı notu eklendi.");
  }

  // Yasal uyarı
  if (!LEGAL_PATTERNS.some((re) => re.test(content))) {
    content += `\n\n## Yasal uyarı\n\n${LEGAL_BLOCK}\n`;
    changes.push("Yasal uyarı bloğu eklendi.");
  }

  // KVKK / yerel
  if (!/kvkk|yerel işleme|yerel veri/i.test(content)) {
    content = content.replace(
      /(##\s*Sonuç[\s\S]*?)(?=\n##\s*Yasal|$)/i,
      (m) =>
        m +
        "\nQodi’nin %100 yerel veri işleme ve KVKK uyumu, kurumsal güven için temel bir farklılaşmadır.\n"
    );
    changes.push("KVKK / yerel işleme vurgusu güçlendirildi.");
  }

  if (changes.length === 0) changes.push("Metin zaten marka kurallarına yakındı; minimal dokunuş.");

  return {
    title: title.slice(0, TITLE_MAX),
    content: content.trim(),
    changes,
    skill: "brand-refiner",
  };
}

/**
 * Matriks checklist (skills/matriks-checklist.md ile uyumlu).
 * @param {{ title: string, content: string, keywords?: string[], wordCount?: number }} post
 */
export function runMatriksChecklist(post) {
  const content = post.content || "";
  const title = post.title || "";
  const keywords = Array.isArray(post.keywords) ? post.keywords : [];
  const wordCount = post.wordCount ?? countWords(content);
  const haystack = `${title}\n${content}`;

  /** @type {Array<{ id: number, text: string, status: 'pass'|'fail'|'warn', detail?: string }>} */
  const items = [];

  const push = (id, text, ok, warn = false, detail) => {
    items.push({
      id,
      text,
      status: ok ? "pass" : warn ? "warn" : "fail",
      detail,
    });
  };

  push(1, "Yasal uyarı var mı?", LEGAL_PATTERNS.some((re) => re.test(content)));
  push(2, "Qodi ve Matriks adları geçiyor mu?", /qodi/i.test(content) && /matriks/i.test(content));
  const roleOk =
    !/qodi.{0,40}kantitatif platform/i.test(content) &&
    !/quantex.{0,30}sohbet/i.test(content);
  push(3, "Ürün konumlandırması doğru mu? (Qodi ≠ Quantex ≠ MCP)", roleOk, false,
    roleOk ? undefined : "Olası ürün rolü karışıklığı");
  push(4, "Abartılı getiri / garanti iddiası yok mu?",
    !/garantili getiri|kesin kazanç|%100 getiri/i.test(content));
  let comingSoon = false;
  for (const rule of FORBIDDEN_COMING_SOON_AS_LIVE) {
    if (rule.re.test(content)) comingSoon = true;
  }
  push(5, "“Yakında” özellik canlı gibi sunulmamış mı?", !comingSoon);
  const headings = (content.match(/^##\s+/gm) || []).length;
  push(6, "En az 3 ## alt başlık var mı?", headings >= 3, headings >= 2, `${headings} başlık`);
  push(7, "Kelime sayısı 800–2200 mü?", wordCount >= MIN_WORDS && wordCount <= MAX_WORDS, false, `${wordCount} kelime`);
  const kwHits = keywords.filter((k) =>
    haystack.toLocaleLowerCase("tr-TR").includes(String(k).toLocaleLowerCase("tr-TR"))
  ).length;
  push(8, "SEO anahtar kelimeleri metinde geçiyor mu?",
    keywords.length === 0 ? false : kwHits / keywords.length >= 0.5,
    keywords.length > 0 && kwHits / keywords.length >= 0.3,
    `${kwHits}/${keywords.length}`);
  push(9, "KVKK / yerel / güvenlik vurgusu var mı?", /kvkk|yerel|güvenli|güvenlik/i.test(content));
  push(10, "Sonuç + yasal uyarı bölümleri var mı?",
    /##\s*Sonuç/i.test(content) && /##\s*Yasal/i.test(content));

  const pass = items.filter((i) => i.status === "pass").length;
  const fail = items.filter((i) => i.status === "fail").length;
  const warn = items.filter((i) => i.status === "warn").length;

  return { items, summary: { pass, fail, warn, total: items.length } };
}

/**
 * checkBlog + Matriks checklist → data/reviews/YYYY-MM-DD-review.md
 * @param {string} reviewsDir
 * @param {{ post: object, quality: object, checklist: object, blogMdPath?: string }} input
 */
export async function writeReviewMarkdown(reviewsDir, input) {
  await mkdir(reviewsDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const filePath = path.join(reviewsDir, `${day}-review.md`);
  const { post, quality, checklist, blogMdPath } = input;

  const lines = [
    `# Blog Kontrol Raporu — ${day}`,
    ``,
    `**postId:** ${post.id}`,
    `**başlık:** ${post.title}`,
    `**blog dosyası:** ${blogMdPath ?? "(yok)"}`,
    `**oluşturma:** ${new Date().toISOString()}`,
    ``,
    `## Otomatik skor (checkBlog)`,
    ``,
    `- Skor: **${quality.score}/${quality.maxScore}** (%${quality.percent})`,
    `- Verdict: **${quality.verdict}**`,
    `- Kelime: ${quality.wordCount}`,
    ``,
  ];

  if (quality.notes?.length) {
    lines.push(`### Skor notları`, ``);
    for (const n of quality.notes) lines.push(`- ${n}`);
    lines.push(``);
  }

  lines.push(`## Matriks checklist`, ``);
  lines.push(
    `Özet: ${checklist.summary.pass} pass / ${checklist.summary.warn} warn / ${checklist.summary.fail} fail (toplam ${checklist.summary.total})`,
    ``
  );
  for (const item of checklist.items) {
    const icon =
      item.status === "pass" ? "✅" : item.status === "warn" ? "⚠️" : "❌";
    lines.push(
      `${icon} **${item.id}. ${item.text}** — \`${item.status}\`${
        item.detail ? ` (${item.detail})` : ""
      }`
    );
  }

  lines.push(
    ``,
    `## Sonuç`,
    ``,
    quality.percent >= 80 && checklist.summary.fail === 0
      ? `Yazı yayın için uygun görünüyor (skor ≥ 80 ve checklist fail yok).`
      : `Yayın öncesi revizyon önerilir. Fail maddeleri ve skor notlarını düzeltin.`,
    ``
  );

  await writeFile(filePath, lines.join("\n"), "utf8");
  return { filePath, day };
}

/**
 * @param {string} postsDir
 * @param {string} postId
 * @param {{ title: string, content: string }} refined
 */
export async function updatePostContent(postsDir, postId, refined) {
  const loaded = await loadPost(postsDir, postId);
  if (!loaded) return null;
  const validation = validateBlogDraft({
    title: refined.title,
    content: refined.content,
    keywords: loaded.post.keywords,
    category: loaded.post.category,
  });
  const updated = {
    ...loaded.post,
    title: refined.title,
    content: refined.content,
    wordCount: validation.wordCount,
    status: validation.status,
    errors: validation.errors,
    warnings: validation.warnings,
    updatedAt: new Date().toISOString(),
    refinedAt: new Date().toISOString(),
  };
  await writeFile(loaded.filePath, JSON.stringify(updated, null, 2), "utf8");
  return { post: updated, filePath: loaded.filePath };
}

export { CATEGORIES, MIN_WORDS, MAX_WORDS, LEGAL_BLOCK };
