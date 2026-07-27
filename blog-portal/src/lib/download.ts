/** Tarayıcıda metin dosyası indir. */
export function downloadText(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function slugifyFilename(title: string) {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'blog-taslak'
  )
}

/** Basit HTML sarmalayıcı (Word/e-posta için). */
export function markdownToSimpleHtml(title: string, markdown: string) {
  const safeTitle = title.replace(/</g, '')
  const blocks = markdown
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  const htmlBlocks = blocks.map((block) => {
    const escaped = block
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    if (/^### /.test(escaped)) {
      return `<h3>${escaped.replace(/^### /, '')}</h3>`
    }
    if (/^## /.test(escaped)) {
      return `<h2>${escaped.replace(/^## /, '')}</h2>`
    }
    if (/^# /.test(escaped)) {
      return `<h1>${escaped.replace(/^# /, '')}</h1>`
    }
    const withBold = escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>')
    return `<p>${withBold}</p>`
  })

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<title>${safeTitle}</title>
<style>
body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;line-height:1.65;color:#1e293b;padding:0 1rem}
h1,h2,h3{font-family:system-ui,sans-serif;color:#0f172a;margin:1.4em 0 0.5em}
p{margin:0.75em 0}
@media print{body{margin:1rem;max-width:none}}
</style>
</head>
<body>
${htmlBlocks.join('\n')}
</body>
</html>`
}

/**
 * PDF: yeni pencerede yazdır diyaloğu açar
 * (Hedef: “PDF olarak kaydet” — ekstra kütüphane yok).
 */
export function downloadPdf(title: string, markdown: string) {
  const html = markdownToSimpleHtml(title, markdown)
  const w = window.open('', '_blank')
  if (!w) {
    throw new Error(
      'Popup engellendi. Tarayıcıda bu site için pencerelere izin verin.',
    )
  }
  w.document.open()
  w.document.write(
    html.replace(
      '</body>',
      `<script>
        window.addEventListener('load', function () {
          setTimeout(function () { window.focus(); window.print(); }, 250);
        });
      </script></body>`,
    ),
  )
  w.document.close()
}
