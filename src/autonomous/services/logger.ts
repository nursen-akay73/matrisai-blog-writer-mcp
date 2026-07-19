/**
 * Internal logger — stdout'a yazmaz (MCP stdio JSON-RPC bozulmasın).
 * Tüm loglar stderr veya opsiyonel log dosyasına gider.
 */

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { getProjectRoot } from "./config.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

function formatLine(level: LogLevel, scope: string, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] [${scope}] ${message}\n`;
}

async function appendLogFile(line: string): Promise<void> {
  try {
    const logDir = path.join(getProjectRoot(), "data", "logs");
    await mkdir(logDir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    await appendFile(path.join(logDir, `pipeline-${day}.log`), line, "utf8");
  } catch {
    /* dosya yazılamazsa sessiz — stderr zaten var */
  }
}

export function createLogger(scope: string) {
  const write = (level: LogLevel, message: string, meta?: unknown) => {
    const extra =
      meta === undefined
        ? ""
        : ` ${typeof meta === "string" ? meta : JSON.stringify(meta)}`;
    const line = formatLine(level, scope, message + extra);
    process.stderr.write(line);
    void appendLogFile(line);
  };

  return {
    debug: (msg: string, meta?: unknown) => write("debug", msg, meta),
    info: (msg: string, meta?: unknown) => write("info", msg, meta),
    warn: (msg: string, meta?: unknown) => write("warn", msg, meta),
    error: (msg: string, meta?: unknown) => write("error", msg, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
