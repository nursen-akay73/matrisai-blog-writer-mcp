/**
 * Tool köprüsü — varsayılan: in-process (blog.js, MCP tool semantiği).
 * PIPELINE_MCP_STDIO=1 → gerçek MCP Client stdio (yavaş olabilir).
 * Claude Desktop ayrı process: src/server.js — bu köprü onu bozmaz.
 */

import path from "node:path";

import { getProjectRoot } from "./config.js";
import { createLogger, type Logger } from "./logger.js";
import {
  runtimeCallToolJson,
  runtimeGetQodiInfo,
} from "./tool-runtime.js";

type McpTextResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

type Client = import("@modelcontextprotocol/sdk/client/index.js").Client;
type StdioClientTransport =
  import("@modelcontextprotocol/sdk/client/stdio.js").StdioClientTransport;

export class McpBridge {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private readonly log: Logger;
  private mode: "inprocess" | "stdio" = "inprocess";

  constructor(logger?: Logger) {
    this.log = logger ?? createLogger("mcp-bridge");
  }

  async connect(): Promise<void> {
    const wantStdio = process.env.PIPELINE_MCP_STDIO === "1";

    if (!wantStdio) {
      this.mode = "inprocess";
      this.log.info(
        "Tool runtime: in-process (MCP tool semantiği). Stdio için PIPELINE_MCP_STDIO=1"
      );
      return;
    }

    if (this.client) return;
    this.mode = "stdio";
    this.log.info("MCP SDK yükleniyor (stdio)…");

    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/stdio.js"
    );

    const root = getProjectRoot();
    const serverJs = path.join(root, "src", "server.js");

    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverJs],
      stderr: "pipe",
      cwd: root,
      env: { ...process.env } as Record<string, string>,
    });

    const errStream = this.transport.stderr;
    if (
      errStream &&
      typeof (errStream as NodeJS.ReadableStream).on === "function"
    ) {
      (errStream as NodeJS.ReadableStream).on("data", (chunk: Buffer) => {
        process.stderr.write(chunk);
      });
    }

    this.client = new Client({
      name: "autonomous-financial-editor",
      version: "3.0.0",
    });
    await this.client.connect(this.transport);
    this.log.info("MCP Client bağlandı", { server: serverJs });
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } catch {
      /* ignore */
    }
    try {
      await this.transport?.close();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.transport = null;
  }

  private extractText(result: McpTextResult): string {
    return (result.content ?? [])
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text as string)
      .join("\n");
  }

  async callToolText(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    if (this.mode === "inprocess") {
      if (name === "getQodiInfo") {
        return runtimeGetQodiInfo(String(args.topic));
      }
      const json = await runtimeCallToolJson(name, args);
      return JSON.stringify(json, null, 2);
    }

    if (!this.client) throw new Error("McpBridge: connect() önce çağrılmalı");
    const result = (await this.client.callTool({
      name,
      arguments: args,
    })) as McpTextResult;
    const text = this.extractText(result);
    if (result.isError) {
      throw new Error(`${name}: ${text.slice(0, 400)}`);
    }
    return text;
  }

  async callToolJson<T>(
    name: string,
    args: Record<string, unknown>
  ): Promise<T> {
    if (this.mode === "inprocess") {
      return (await runtimeCallToolJson(name, args)) as T;
    }
    const text = await this.callToolText(name, args);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`${name} JSON değil: ${text.slice(0, 400)}`);
    }
  }

  async getQodiInfo(topic: string): Promise<string> {
    const text = await this.callToolText("getQodiInfo", { topic });
    if (!text || /geçersiz topic|bulunamadı|başarısız/i.test(text)) {
      throw new Error(`getQodiInfo(${topic}): ${text.slice(0, 200)}`);
    }
    return text;
  }

  async listTools(): Promise<string[]> {
    if (this.mode === "inprocess") {
      return [
        "getQodiInfo",
        "writeBlog",
        "refineBlog",
        "checkBlog",
        "reviewBlog",
      ];
    }
    if (!this.client) throw new Error("McpBridge: connect() önce");
    const listed = await this.client.listTools();
    return listed.tools.map((t) => t.name);
  }
}
