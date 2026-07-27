# Matriks AI — MCP Content Portal (Local)

Standalone UI + **Express + SQLite** backend for the Matriks MCP blog pipeline demo.

- Login → Blog form → Output + Quality Gate dashboard
- **Gerçek pipeline:** `data/qodi-bilgi-dosyasi-v2.md` topic’leri → Writer → Editor
- Skor &lt; 80 ise max 3 tur self-correction (Dashboard’da tur tur görünür)
- Drafts SQLite (`data/blogs.db`) + `data/posts/*.md` / `data/reviews/*.md`
- Visual language aligned with mcp.matriks.ai / qodi.matriks.ai

## Adım adım çalıştır

```bash
cd blog-portal
npm install
npm run dev
```

Bu komut iki process açar:

1. **API** → `http://127.0.0.1:8789` (Express + SQLite)
2. **UI** → `http://localhost:5173` (Vite; `/api` proxy ile API’ye gider)

### Demo login

- Email: `nursen.akay@matriksdata.com`
- Password: `admin1234`

## Mimari (kısa)

```
UI (React)
   │  fetch /api/...
   ▼
Vite proxy → Express (:8789)
   │
   ▼
SQLite dosyası: blog-portal/data/blogs.db
```

| Endpoint | Ne yapar |
|---|---|
| `POST /api/auth/login` | Config kullanıcı/şifre kontrolü |
| `GET /api/blogs` | Tüm taslaklar |
| `POST /api/blogs` | Kaydet / güncelle |
| `DELETE /api/blogs/:id` | Sil |
| `GET /api/health` | API + DB yolu |

## Supabase farkı

Bu kurulum **bilgisayarındaki SQLite dosyası**dır; internet/cloud hesabı yok, ücret yok. Supabase bulutta çalışır ve API key ister.

## Not

Canlı LLM pipeline (`qodi-mcp` root) henüz bağlı değil. UI Writer→Editor skor akışını mock ile taklit eder; kayıt gerçek SQLite’a yazılır.
