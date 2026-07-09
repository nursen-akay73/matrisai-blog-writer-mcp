# Qodi Bilgi + Blog MCP Sunucusu

Qodi / Matriks MCP ürün bilgisini topic bazlı sunar; LLM'in yazdığı blogu kaydeder ve kontrol eder.

## Araçlar

| Tool | Ne yapar? |
|---|---|
| `getQodiInfo` | `data/qodi-bilgi-dosyasi-v2.md` içinden konu bazlı referans metni döner |
| `writeBlog` | LLM'in ürettiği yazıyı `data/posts/` altına kaydeder + kural kapısı |
| `checkBlog` | Kayıtlı yazıyı yapı / yasal uyarı / marka / SEO skorlar |

**Önemli:** Metni üreten LLM'dir. MCP kaynak verir, kaydeder ve kontrol eder — sihirli “otomatik blog motoru” değildir.

### Önerilen akış

1. `getQodiInfo` → ilgili topic'ler (`genel_tanim`, `farklar`, `yasal_uyari`, …)
2. LLM blog metnini yazar (Qodi bilgisine sadık kalarak)
3. `writeBlog` → kaydet (`postId` döner)
4. `checkBlog` → skor / `ready` | `needs_revision` | `reject`

### matrisai-blog-mcp ile birlikte kullanım

Cursor'da her iki MCP de açıksa:

| Amaç | qodi-mcp | matrisai-blog-mcp |
|---|---|---|
| Doğru ürün bilgisi | `getQodiInfo` | — |
| Yazım brifi | — | `get_writing_brief` |
| Kaydet | `writeBlog` | `write_blog_post` |
| Kontrol | `checkBlog` | `check_blog_post` |

Tipik karma akış: brif için `get_writing_brief` → kaynak için `getQodiInfo` → yaz → `writeBlog` + isteğe bağlı `check_blog_post`.

## Kurulum

```bash
git clone <bu-repo-url> qodi-mcp
cd qodi-mcp
npm install
npm start
```

## Claude Desktop / Cursor'a ekleme

Örnek: `claude_desktop_config.example.json`.

**Önemli:** `args` yolunu kendi klonladığınız dizine göre güncelleyin.

```json
{
  "mcpServers": {
    "qodi-bilgi-yerel": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/qodi-mcp/src/server.js"]
    }
  }
}
```

Config sonrası Cursor / Claude'u yeniden başlatın.

## writeBlog kuralları (özet)

- Kelime: ~800–2200
- Yasal uyarı zorunlu: “yatırım tavsiyesi değildir” / “bilgilendirme amaçlıdır”
- 3–10 SEO anahtar kelimesi
- Kategori: `AI` | `Teknoloji` | `Finansal` | `Güvenlik`
- “Yakında” özellikler (Belge Analizi, Portföy Optimizasyonu) mevcutmuş gibi yazılmamalı

## Bilgi dosyasını güncelleme

1. `data/qodi-bilgi-dosyasi-v2.md` düzenle
2. MCP'yi yeniden başlat
3. Enum ve içerikler dosyadan türetilir (canlı reload yok)

## İçerik Güncelleme Rehberi (yeni topic)

1. Bölüm 0 tablosuna satır: `| \`yeni_topic\` | 15 | Kapsam |`
2. Başlığın altına: `<!-- topic: yeni_topic -->`
3. Sunucuyu yeniden başlat

`tam_metin` özeldir; ayrı yorum satırı aranmaz.

## Gereksinimler

- Node.js 18+
- `@modelcontextprotocol/sdk`, `zod`
