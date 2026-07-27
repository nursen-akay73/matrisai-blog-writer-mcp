import type { Product } from '../types'

export const MATRIKS_SITE = 'https://www.matriks.ai/tr'
export const MCP_PORTAL = 'https://mcp.matriks.ai'
/** Doğrudan qodi.matriks.ai SSL hatası veriyor; ürün sayfası + MCP giriş güvenli */
export const QODI_PRODUCT = 'https://www.matriks.ai/tr/products/qodi'
export const QODI_VIA_MCP =
  'https://mcp.matriks.ai/login?returnUrl=https%3A%2F%2Fqodi.matriks.ai%2F&oauth=true'

/** Onaylı içerik için ürün bazlı yayın / CTA köprüleri */
export function getPublishLinks(product: Product) {
  const links = [
    {
      id: 'matriks-ai',
      label: 'Matriks AI sitesi',
      href: MATRIKS_SITE,
      blurb: 'Ürün ailesi ve kurumsal anlatım',
    },
    {
      id: 'mcp',
      label: 'MCP Portal',
      href: MCP_PORTAL,
      blurb: 'API key al, Claude / Cursor’a bağlan',
    },
  ]

  if (product === 'Qodi' || product === 'Matriks MCP') {
    links.push({
      id: 'qodi',
      label: 'Qodi ürün sayfası',
      href: QODI_PRODUCT,
      blurb: 'Qodi’yi Matriks AI üzerinden keşfet',
    })
    links.push({
      id: 'qodi-mcp',
      label: 'Qodi’ye MCP ile gir',
      href: QODI_VIA_MCP,
      blurb: 'MCP girişi üzerinden Qodi deneyimi',
    })
  }

  if (product === 'Matriks MCP') {
    links[1] = {
      ...links[1],
      blurb: 'MCP’yi canlı dene — Cursor & Claude',
    }
  }

  return links
}

/** Blog sonuna eklenecek profesyonel CTA markdown bloğu */
export function buildCtaMarkdown(product: Product, title: string) {
  const links = getPublishLinks(product)
  const lines = [
    '',
    '---',
    '',
    '## Sonraki adım',
    '',
    `*${title}* içeriğini okuduktan sonra Matriks AI ekosistemini deneyebilirsiniz:`,
    '',
  ]
  for (const l of links) {
    lines.push(`- **[${l.label}](${l.href})** — ${l.blurb}`)
  }
  lines.push('')
  return lines.join('\n')
}
