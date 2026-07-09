/**
 * Blog yazma / kontrol yardımcıları.
 *
 * writeBlog  → LLM'in ürettiği yazıyı kaydeder + temel kurallara göre kabul/red
 * checkBlog  → kayıtlı yazıyı dil, SEO, yasal uyarı, ton açısından skorlar
 *
 * Not: Metni üreten LLM'dir; bu modül kaydetme + kalite kapısıdır.
 * İsteğe bağlı olarak matrisai-blog-mcp ile birlikte de kullanılabilir.
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
    re: /belge analizi.{0,40}(mevcut|kullanılabilir|şimdi|canlı)/i,
    tip: '"Belge Analizi" yakında gelecek; mevcut özellik gibi sunulmamalı.',
  },
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

export { CATEGORIES, MIN_WORDS, MAX_WORDS };
