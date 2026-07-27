import type { BlogDraft } from '../types'

/** Mentor/UI testi: gerçek pipeline kurallı olduğu için düşük skor vermez; bu örnek elle eklenir. */
export function buildLowScoreDemoDraft(): BlogDraft {
  const id = `demo-low-${Date.now()}`
  const contentMarkdown = `# Qodi ile kesin kazanç

Qodi kantitatif platformdur ve Quantex ile aynıdır.
Portföy Optimizasyonu şu an canlı ve kullanılabilir.
Qodi ile garantili getiri ve kesin kazanç sağlanır, %100 getiri mümkündür.

Kısa metin.`

  return {
    id,
    title: 'DEMO · Düşük skor örneği (revize testi)',
    product: 'Qodi',
    scope: 'Demo: kasıtlı kalite ihlalleri',
    audience: 'Corporate',
    contentMarkdown,
    createdAt: new Date().toISOString(),
    status: 'draft',
    feedbackNote: 'Bu taslak UI testi için eklendi; gerçek pipeline çıktısı değildir.',
    quality: {
      score: 30,
      maxScore: 100,
      percent: 30,
      verdict: 'needs_revision',
      wordCount: 42,
      dimensions: [
        { area: 'structure', label: 'Yapı / uzunluk', score: 5, max: 25 },
        { area: 'legal', label: 'Yasal / SPK dili', score: 5, max: 25 },
        { area: 'brand', label: 'Marka / ton', score: 5, max: 20 },
        { area: 'seo', label: 'SEO', score: 15, max: 30 },
      ],
      checklist: [
        {
          id: 1,
          text: 'Yasal uyarı var mı?',
          status: 'fail',
          detail: 'Yatırım tavsiyesi değildir ifadesi yok',
        },
        {
          id: 2,
          text: 'Qodi ve Matriks adları geçiyor mu?',
          status: 'fail',
          detail: 'Matriks geçmiyor',
        },
        {
          id: 3,
          text: 'Ürün konumlandırması doğru mu? (Qodi ≠ Quantex ≠ MCP)',
          status: 'fail',
          detail: 'Qodi kantitatif platform diye anlatılmış',
        },
        {
          id: 4,
          text: 'Abartılı getiri / garanti iddiası yok mu?',
          status: 'fail',
          detail: 'garantili getiri / %100 getiri',
        },
        {
          id: 5,
          text: '“Yakında” özellik canlı gibi sunulmamış mı?',
          status: 'fail',
          detail: 'Portföy Optimizasyonu canlı gibi',
        },
        {
          id: 6,
          text: 'En az 3 ## alt başlık var mı?',
          status: 'fail',
          detail: '0 başlık',
        },
        {
          id: 7,
          text: 'Kelime sayısı 800–2200 mü?',
          status: 'fail',
          detail: '42 kelime',
        },
        {
          id: 8,
          text: 'SEO anahtar kelimeleri metinde geçiyor mu?',
          status: 'warn',
          detail: '1/5',
        },
        {
          id: 9,
          text: 'KVKK / yerel / güvenlik vurgusu var mı?',
          status: 'fail',
        },
        {
          id: 10,
          text: 'Sonuç + yasal uyarı bölümleri var mı?',
          status: 'fail',
        },
      ],
      checklistSummary: { pass: 0, fail: 9, warn: 1, total: 10 },
    },
    pipeline: {
      source: 'mock',
      revisions: 0,
      maxRevisions: 3,
      scoreThreshold: 80,
      percent: 30,
      verdict: 'needs_revision',
      attempts: [
        {
          revision: 0,
          percent: 30,
          verdict: 'needs_revision',
          revisionHints: [
            'Yasal uyarı ekle',
            'Garanti dilini kaldır',
            'Kelime sayısını artır',
          ],
        },
      ],
    },
  }
}
