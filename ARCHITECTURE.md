# Autonomous Financial Editor Pipeline — Mimari

## Klasör yapısı

```
qodi-mcp/
├── config/
│   └── blog-automation.json          # cron, everyDays, threshold, maxRevisions, port
├── skills/
│   ├── blog-editor.md                # Writer skill dokümanı
│   ├── brand-refiner.md
│   └── matriks-checklist.md          # Editor checklist
├── data/
│   ├── qodi-bilgi-dosyasi-v2.md      # Master döküman
│   ├── posts/                        # Blog MD + JSON
│   ├── reviews/                      # Editor kontrol MD
│   └── logs/                         # Internal logger
├── src/
│   ├── server.js                     # MCP sunucu (stdio) — değiştirme dikkatli
│   ├── blog.js                       # writeBlog / checkBlog / refine / review
│   ├── autonomous/
│   │   ├── types.ts
│   │   ├── autonomous-orchestrator.ts  # Self-correction + ajan yönetimi
│   │   ├── agents/
│   │   │   ├── writer-agent.ts         # Writer Skill
│   │   │   └── editor-agent.ts         # Editor Skill
│   │   └── services/
│   │       ├── logger.ts               # stderr + dosya (stdout YOK)
│   │       ├── config.ts
│   │       └── mcp-bridge.ts           # MCP Client stdio
│   └── api/
│       ├── http-server.ts              # Express + cron giriş
│       ├── app.ts
│       └── routes/
│           └── pipeline.routes.ts      # POST /api/v1/trigger-pipeline
└── package.json
```

## Ajan akışı

```
Trigger (cron | HTTP | CLI)
    → Writer: getQodiInfo → taslak → refineBlog → writeBlog
    → Editor: checkBlog → EditorReport JSON → reviewBlog
    → percent < 80? → findings Writer'a geri → max 3 tur
    → blog MD + review MD
```

## Tetikleyiciler

| Kaynak | Nasıl |
|---|---|
| Cron | `config.cron` + `everyDays` kapısı |
| HTTP | `POST /api/v1/trigger-pipeline` |
| CLI | `npm run pipeline:once` |

## Tool köprüsü

- Varsayılan: **in-process** (`tool-runtime.ts` → `blog.js`) — MCP tool adları/sözleşmesi aynı.
- `PIPELINE_MCP_STDIO=1`: gerçek MCP Client → `server.js` stdio.
- Claude Desktop her zaman ayrı `npm start` (stdio); HTTP/cron stdout kullanmaz (logger → stderr + `data/logs/`).

## npm

```bash
npm install
npm run pipeline:once    # test
npm run pipeline         # HTTP :8787 + cron
```
