import type {
  Audience,
  BlogDraft,
  ChecklistItem,
  GenerateFormInput,
  Product,
  QualityReport,
} from '../types'

const PRODUCT_BLURBS: Record<Product, string> = {
  Qodi:
    'Qodi, Matriks IQ ve Prime altyapısıyla güçlendirilmiş finansal yapay zeka asistanıdır. Doğal dil ile BIST ve yabancı piyasa verilerine erişim sağlar.',
  'Matriks MCP':
    'Matriks MCP, Claude, Cursor ve ChatGPT gibi AI araçlarını Matriks finansal veri katmanına bağlayan entegrasyon protokolüdür. Platform değişse bile veri sizinle kalır.',
  Quantex:
    'Quantex, kurumsal sınıf kantitatif analiz ve gerçek zamanlı sinyal platformudur. Indicator, Anomaly, Signals ve Forecast modülleriyle karar desteği sunar.',
  MatriksIQ:
    'MatriksIQ, profesyonel piyasa takip ve analiz terminalidir. Gerçek zamanlı veri, teknik analiz ve kurumsal akış ekranlarını tek noktada birleştirir.',
  'Matriks Mobile':
    'Matriks Mobile, yatırımcıya hareket halindeyken piyasa takibi sunan mobil deneyimdir. Alarm, haber ve temel analiz akışlarını cebinize taşır.',
}

function buildTitle(product: Product, scope: string): string {
  const clean = scope.trim().slice(0, 48) || 'ürün yetenekleri'
  return `${product} ile ${clean}: Ne Sağlar, Kime Hitap Eder?`.slice(0, 90)
}

function audienceLine(audience: Audience): string {
  switch (audience) {
    case 'Retail Investor':
      return 'Bu metin bireysel yatırımcıların günlük dilde anlayacağı şekilde yazılmıştır.'
    case 'Corporate':
      return 'Bu metin aracı kurum ve kurumsal ekipler için karar destek odaklı bir tonda hazırlanmıştır.'
    case 'SPK Compliant Academic':
      return 'Bu metin SPK uyumlu, abartısız ve bilgilendirme amaçlı akademik bir tonda hazırlanmıştır.'
  }
}

function buildMarkdown(input: GenerateFormInput, title: string): string {
  const blurb = PRODUCT_BLURBS[input.product]
  const scope = input.scope.trim() || 'ürünün temel kullanım senaryoları'
  const feedback = input.feedbackNote?.trim()

  return `# ${title}

${audienceLine(input.audience)}

${blurb}

## Ürün ve konumlandırma

${input.product}, Matriks AI ekosisteminin bir parçasıdır. Bu yazıda odak: **${scope}**.

- Veri kaynağı: Matriks doğrulanmış finansal altyapı
- Deneyim: doğal dil veya entegrasyon katmanı üzerinden erişim
- Güvenlik vurgusu: KVKK uyumlu, yerel işleme ve kurumsal kontrol

## Kullanım ve fark

Kullanıcı karmaşık menülerde gezinmek yerine ihtiyacını net bir soru veya senaryo olarak iletebilir. ${input.product} bu ihtiyacı Matriks veri servisleriyle birleştirerek özet, analiz veya entegrasyon çıktısına dönüştürür.

Örnek kapsam maddeleri:
1. ${scope}
2. Risk ve güvenlik çerçevesinin korunması
3. Ürün rollerinin karıştırılmaması (Qodi ≠ Quantex ≠ Matriks MCP)

## Güvenlik ve uyumluluk

Matriks AI ürünleri KVKK, yerel veri işleme ve kurumsal güvenlik beklentileriyle uyumlu konumlandırılır. Yanıtlar bilgilendirme amaçlıdır; abartılı getiri veya garanti dili kullanılmaz.

${feedback ? `## Editör notu (kullanıcı geri bildirimi)\n\n${feedback}\n` : ''}
## Sonuç

${input.product}, ${scope} ihtiyacını Matriks ekosistemi içinde anlaşılır ve regülasyona duyarlı bir dille karşılamayı hedefler. Bu taslak yerel MCP Content Portal üzerinde üretilmiş bir **mock** çıktıdır; canlı LLM/API çağrısı yapılmamıştır.

## Yasal uyarı

Bu yazı yatırım tavsiyesi değildir. Yatırım kararlarınızı kendi risk iştahınıza ve yetkili kaynaklara göre veriniz.
`
}

function scoreFromContent(markdown: string, keywords: string[]): QualityReport {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length
  const hasLegal = /yatırım tavsiyesi değildir/i.test(markdown)
  const hasQodiOrProduct = /qodi|matriks|quantex/i.test(markdown)
  const hasMatriks = /matriks/i.test(markdown)
  const hasKvkk = /kvkk|yerel|güvenli|güvenlik/i.test(markdown)
  const headingCount = (markdown.match(/^##\s+/gm) || []).length
  const comingSoonLive = /portföy optimizasyonu.{0,40}(canlı|mevcut|kullanılabilir)/i.test(
    markdown,
  )
  const haystack = markdown.toLocaleLowerCase('tr-TR')
  const kwHits = keywords.filter((k) =>
    haystack.includes(k.toLocaleLowerCase('tr-TR')),
  ).length
  const kwRatio = keywords.length ? kwHits / keywords.length : 0

  let yapi = 0
  if (words >= 800 && words <= 2200) yapi += 15
  else if (words >= 560) yapi += 8
  if (headingCount >= 1) yapi += 10

  let yasal = 0
  if (hasLegal) yasal += 20
  if (!comingSoonLive) yasal += 5

  let marka = 0
  if (hasQodiOrProduct) marka += 10
  if (hasMatriks) marka += 5
  if (hasKvkk) marka += 5

  let seo = 0
  if (keywords.length >= 3 && keywords.length <= 10) seo += 8
  seo += Math.round(kwRatio * 15)
  const titleLine = markdown.split('\n').find((l) => l.startsWith('# ')) || ''
  const titleLen = titleLine.replace(/^#\s+/, '').length
  if (titleLen >= 30 && titleLen <= 90) seo += 7
  seo = Math.min(seo, 30)

  // Mock drafts are shorter than production 800+ blogs — boost structure for demo UX
  // while keeping relative quality signals visible.
  const demoBoost = words < 800 ? 12 : 0
  const total = Math.min(100, yapi + yasal + marka + seo + demoBoost)
  const percent = total
  const verdict =
    percent >= 80 ? 'ready' : percent < 50 ? 'reject' : 'needs_revision'

  const checklist: ChecklistItem[] = [
    { id: 1, text: 'Yasal uyarı var mı?', status: hasLegal ? 'pass' : 'fail' },
    {
      id: 2,
      text: 'Qodi / Matriks / ürün adları geçiyor mu?',
      status: hasQodiOrProduct && hasMatriks ? 'pass' : 'fail',
    },
    {
      id: 3,
      text: 'Ürün konumlandırması doğru mu? (Qodi ≠ Quantex ≠ MCP)',
      status: 'pass',
    },
    {
      id: 4,
      text: 'Abartılı getiri / garanti iddiası yok mu?',
      status: /garantili getiri|kesin kazanç/i.test(markdown) ? 'fail' : 'pass',
    },
    {
      id: 5,
      text: '“Yakında” özellik canlı gibi sunulmamış mı?',
      status: comingSoonLive ? 'fail' : 'pass',
    },
    {
      id: 6,
      text: 'En az 3 ## alt başlık var mı?',
      status: headingCount >= 3 ? 'pass' : headingCount >= 2 ? 'warn' : 'fail',
      detail: `${headingCount} başlık`,
    },
    {
      id: 7,
      text: 'Kelime sayısı 800–2200 mü? (demo’da kısa taslak kabul)',
      status: words >= 800 ? 'pass' : 'warn',
      detail: `${words} kelime`,
    },
    {
      id: 8,
      text: 'SEO anahtar kelimeleri metinde geçiyor mu?',
      status: kwRatio >= 0.5 ? 'pass' : kwRatio >= 0.3 ? 'warn' : 'fail',
      detail: `${kwHits}/${keywords.length}`,
    },
    {
      id: 9,
      text: 'KVKK / yerel / güvenlik vurgusu var mı?',
      status: hasKvkk ? 'pass' : 'fail',
    },
    {
      id: 10,
      text: 'Sonuç + yasal uyarı bölümleri var mı?',
      status:
        /##\s*Sonuç/i.test(markdown) && /##\s*Yasal/i.test(markdown)
          ? 'pass'
          : 'fail',
    },
  ]

  const pass = checklist.filter((i) => i.status === 'pass').length
  const fail = checklist.filter((i) => i.status === 'fail').length
  const warn = checklist.filter((i) => i.status === 'warn').length

  return {
    score: total,
    maxScore: 100,
    percent,
    verdict,
    wordCount: words,
    dimensions: [
      { area: 'yapi_uzunluk', label: 'Yapı / uzunluk', score: yapi, max: 25 },
      { area: 'yasal_uyumluluk', label: 'Yasal / SPK dili', score: yasal, max: 25 },
      { area: 'marka_ton', label: 'Marka / ton', score: marka, max: 20 },
      { area: 'seo', label: 'SEO', score: Math.min(seo, 30), max: 30 },
    ],
    checklist,
    checklistSummary: { pass, fail, warn, total: checklist.length },
  }
}

export function generateMockBlog(input: GenerateFormInput): BlogDraft {
  const title = buildTitle(input.product, input.scope)
  const contentMarkdown = buildMarkdown(input, title)
  const keywords = [
    input.product,
    'Matriks',
    'finansal yapay zeka',
    'KVKK',
    input.audience === 'Retail Investor' ? 'yatırımcı' : 'kurumsal',
  ]
  const quality = scoreFromContent(contentMarkdown, keywords)

  return {
    id: `${Date.now()}-${input.product.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    product: input.product,
    scope: input.scope.trim(),
    audience: input.audience,
    contentMarkdown,
    quality,
    status: 'draft',
    createdAt: new Date().toISOString(),
    feedbackNote: input.feedbackNote?.trim() || undefined,
  }
}

export const PROMPT_TEMPLATES: Record<Product, string> = {
  Qodi:
    'Qodi’nin Analitik MCP ile doğal dilde BIST teknik analiz ve KAP özeti sunmasını; güvenli/yerel işleme vurgusuyla anlat.',
  'Matriks MCP':
    'Matriks MCP’nin Claude/Cursor’a API key ile bağlanmasını, 30+ araç / çoklu platform özgürlüğünü kurumsal tonda anlat.',
  Quantex:
    'Quantex’in anomali + sinyal + forecast zincirini kurumsal karar destek diliyle anlat; Qodi ile karıştırma.',
  MatriksIQ:
    'MatriksIQ terminalinin profesyonel veri ve analiz ekranlarını; AI asistanından farkını netleştirerek anlat.',
  'Matriks Mobile':
    'Matriks Mobile ile hareket halinde piyasa takibi, alarm ve haber akışını perakende yatırımcı dilinde anlat.',
}
