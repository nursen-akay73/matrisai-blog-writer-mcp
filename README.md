# Qodi MCP + Autonomous Financial Editor (v3)

Matriks ürün bilgisi (Qodi / MCP / Quantex) için yerel **MCP sunucusu** + blog üretimini **otomatikleştiren** pipeline.

---

## Nasıl bir mimari tasarladık? (kısa)

İki katman var; birbirini bozmaz:

```
1) MCP (Claude Desktop)
   sohbet → getQodiInfo / writeBlog / checkBlog / refineBlog / reviewBlog
   giriş: src/server.js (stdio)

2) Otomasyon Pipeline (Claude gerekmez)
   cron veya HTTP → Writer → Editor → (skor < 80 ise tekrar) → MD dosyaları
   giriş: npm run pipeline
```

| Parça | Görev |
|---|---|
| Master MD | `data/qodi-bilgi-dosyasi-v2.md` — tek doğruluk kaynağı |
| Writer | Topic’lerden taslak yazar, kaydeder |
| Editor | Skor + Matriks checklist → `data/reviews/*.md` |
| Self-correction | Skor &lt; 80 ise max 3 tur otonom düzeltme |
| Tetikleme | 3 günde bir 09:00 **veya** HTTP `curl` |

**Fikir:** MCP = standart araçlar. Otomasyon = bu araçları zamanlayıcı/HTTP ile çağıran ayrı process. Loglar stderr’de (stdio bozulmaz).

Ayrıntı: [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Kurulum

```bash
cd /Users/nursenakay/Desktop/qodi-mcp
npm install
```

---

## Claude Desktop (MCP sohbet)

Config örneği: `claude_desktop_config.example.json`  
`args` yolunu kendi makinedeki `.../qodi-mcp/src/server.js` yap.

```bash
npm start
```

Claude’da tool’lar görünür; bu **otomasyon değil**, sohbet kullanımıdır.

---

## Klasörler

```
src/server.js           # MCP stdio
src/blog.js             # write / check / refine / review
src/autonomous/         # Writer, Editor, orchestrator
src/api/run-pipeline.mjs
skills/                 # format + checklist
config/blog-automation.json
data/posts/             # blog MD
data/reviews/           # kontrol MD
```

---

## Terminalde nasıl çağırırım? (kopyala-yapıştır)

### A) Otomasyonu aç (Terminal 1 — açık kalsın)

```bash
cd /Users/nursenakay/Desktop/qodi-mcp
npm run pipeline
```

`HAZIR — http://127.0.0.1:8787` (veya 8788) görününce hazır.

### B) Hemen bir blog üret (Terminal 2)

Port **8787** ise:

```bash
cd /Users/nursenakay/Desktop/qodi-mcp
curl -s -X POST http://127.0.0.1:8787/api/v1/trigger-pipeline \
  -H 'Content-Type: application/json' \
  -d '{"force":true}'
```

Port **8788** yazdıysa `8787` yerine `8788` yaz.

### C) Tek seferlik (HTTP açmadan)

```bash
cd /Users/nursenakay/Desktop/qodi-mcp
npm run pipeline:once
```

### D) Çıktıları aç (klasör)

```bash
open data/posts/
open data/reviews/
```

### E) Örnek: hem blog hem kontrol dosyasını aç (mentör demosu)

En güncel örnek (19 Temmuz 2026 koşusu) — ikisini birden:

```bash
cd /Users/nursenakay/Desktop/qodi-mcp
open data/posts/2026-07-19-qodi-blog.md
open data/reviews/2026-07-19-review.md
```

| Dosya | Ne |
|---|---|
| `data/posts/2026-07-19-qodi-blog.md` | Üretilen blog yazısı |
| `data/reviews/2026-07-19-review.md` | Editor kontrol raporu (skor / checklist) |

Yeni bir `curl` tetikledikten sonra tarih değişir; o günün `YYYY-MM-DD` değerini kullan.

### F) Sağlık kontrolü

```bash
curl -s http://127.0.0.1:8787/api/v1/health
```

---

## Config

`config/blog-automation.json` — `everyDays`, `cron`, `scoreThreshold` (80), `maxRevisions` (3), `httpPort`.

| Env | Anlam |
|---|---|
| `BLOG_EVERY_DAYS` | Kaç günde bir |
| `BLOG_HOUR` / `BLOG_CRON` | Saat / cron |
| `PIPELINE_HTTP_PORT` | Port |
| `PIPELINE_MCP_STDIO=1` | Gerçek MCP Client (opsiyonel) |
