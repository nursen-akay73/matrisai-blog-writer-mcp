import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { PipelineConfig } from "../types.js";

/** Bundle (dist/) veya src/ fark etmeksizin proje kökü — process.cwd() / paket arama */
async function resolveRoot(): Promise<string> {
  if (process.env.QODI_MCP_ROOT) return process.env.QODI_MCP_ROOT;
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    try {
      await access(path.join(dir, "package.json"));
      await access(path.join(dir, "src", "server.js"));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}

let cachedRoot: string | null = null;

export async function getProjectRootAsync(): Promise<string> {
  if (!cachedRoot) cachedRoot = await resolveRoot();
  return cachedRoot;
}

/** Senkron erişim — loadPipelineConfig sonrası dolu; aksi halde cwd */
export function getProjectRoot(): string {
  return cachedRoot ?? process.env.QODI_MCP_ROOT ?? process.cwd();
}

const DEFAULTS: PipelineConfig = {
  everyDays: 3,
  hour: 9,
  minute: 0,
  cron: "0 9 * * *",
  scoreThreshold: 80,
  maxRevisions: 3,
  category: "Finansal",
  keywords: ["Qodi", "Matriks", "KVKK", "finansal asistan", "yerel AI"],
  sourceTopics: [
    "genel_tanim",
    "farklar",
    "entegrasyon_genel",
    "guvenlik",
  ],
  httpPort: 8787,
};

export async function loadPipelineConfig(): Promise<PipelineConfig> {
  const root = await getProjectRootAsync();
  const configFile = path.join(root, "config", "blog-automation.json");
  let fileCfg: Partial<PipelineConfig> = {};
  try {
    fileCfg = JSON.parse(await readFile(configFile, "utf8")) as Partial<PipelineConfig>;
  } catch {
    /* defaults */
  }

  const everyDays = Number(
    process.env.BLOG_EVERY_DAYS ?? fileCfg.everyDays ?? DEFAULTS.everyDays
  );
  const hour = Number(process.env.BLOG_HOUR ?? fileCfg.hour ?? DEFAULTS.hour);
  const minute = Number(
    process.env.BLOG_MINUTE ?? fileCfg.minute ?? DEFAULTS.minute
  );
  const cron =
    process.env.BLOG_CRON ?? fileCfg.cron ?? `${minute} ${hour} * * *`;
  const httpPort = Number(
    process.env.PIPELINE_HTTP_PORT ?? fileCfg.httpPort ?? DEFAULTS.httpPort
  );
  const maxRevisions = Number(
    process.env.BLOG_MAX_REVISIONS ?? fileCfg.maxRevisions ?? DEFAULTS.maxRevisions
  );
  const scoreThreshold = Number(
    process.env.BLOG_SCORE_THRESHOLD ??
      fileCfg.scoreThreshold ??
      DEFAULTS.scoreThreshold
  );

  return {
    ...DEFAULTS,
    ...fileCfg,
    everyDays,
    hour,
    minute,
    cron,
    httpPort,
    maxRevisions: Math.min(Math.max(maxRevisions, 1), 5),
    scoreThreshold,
  };
}

