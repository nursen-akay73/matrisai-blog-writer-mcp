/**
 * MCP tool semantiğinin in-process çalıştırıcısı.
 * Stdio MCP Client yavaş/askıda kalırsa pipeline yine aynı araç sözleşmesiyle ilerler.
 * Claude Desktop hâlâ src/server.js (stdio) kullanır — bu katman onu bozmaz.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getProjectRoot } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger("tool-runtime");

type BlogModule = typeof import("../../blog.js");

let blogMod: BlogModule | null = null;

async function loadBlog(): Promise<BlogModule> {
  if (blogMod) return blogMod;
  const root = getProjectRoot();
  const href = pathToFileURL(path.join(root, "src", "blog.js")).href;
  blogMod = (await import(href)) as BlogModule;
  return blogMod;
}

function postsDir(): string {
  return path.join(getProjectRoot(), "data", "posts");
}

function reviewsDir(): string {
  return path.join(getProjectRoot(), "data", "reviews");
}

/** getQodiInfo eşdeğeri — server.js ile aynı md sözleşmesi */
export async function runtimeGetQodiInfo(topic: string): Promise<string> {
  const root = getProjectRoot();
  const mdPath = path.join(root, "data", "qodi-bilgi-dosyasi-v2.md");
  const { readFile } = await import("node:fs/promises");
  const md = await readFile(mdPath, "utf8");
  const lines = md.split(/\r?\n/);
  const re = /<!--\s*topic:\s*([a-z0-9_]+)\s*-->/i;
  const markers: Array<{ topic: string; line: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) markers.push({ topic: m[1], line: i });
  }
  const idx = markers.findIndex((x) => x.topic === topic);
  if (idx < 0) throw new Error(`Topic bulunamadı: ${topic}`);
  const start = markers[idx].line + 1;
  let end = idx + 1 < markers.length ? markers[idx + 1].line : lines.length;
  if (idx + 1 < markers.length) {
    let j = end - 1;
    while (j >= start && lines[j].trim() === "") j--;
    if (j >= start && /^#{2,3}\s+/.test(lines[j])) end = j;
  }
  return lines.slice(start, end).join("\n").trim();
}

export async function runtimeRefineBlog(args: {
  title: string;
  content: string;
  postId?: string;
}): Promise<Record<string, unknown>> {
  const blog = await loadBlog();
  const refined = blog.refineBlog({
    title: args.title,
    content: args.content,
  });
  if (args.postId) {
    await blog.updatePostContent(postsDir(), args.postId, refined);
  }
  return {
    ok: true,
    postId: args.postId ?? null,
    title: refined.title,
    content: refined.content,
    changes: refined.changes,
    skill: refined.skill,
  };
}

export async function runtimeWriteBlog(args: {
  title: string;
  content: string;
  keywords: string[];
  category: string;
  sourceTopics?: string[];
}): Promise<Record<string, unknown>> {
  const blog = await loadBlog();
  const { record, filePath } = await blog.writeBlog(postsDir(), args);
  return {
    ok: record.status !== "rejected",
    postId: record.id,
    status: record.status,
    wordCount: record.wordCount,
    errors: record.errors,
    warnings: record.warnings,
    savedTo: filePath,
  };
}

export async function runtimeCheckBlog(postId: string): Promise<Record<string, unknown>> {
  const blog = await loadBlog();
  const loaded = await blog.loadPost(postsDir(), postId);
  if (!loaded) throw new Error(`postId bulunamadı: ${postId}`);
  const report = blog.checkBlogQuality(loaded.post);
  return {
    postId: loaded.post.id,
    title: loaded.post.title,
    previousStatus: loaded.post.status,
    ...report,
  };
}

export async function runtimeReviewBlog(
  postId: string,
  blogMdPath?: string
): Promise<Record<string, unknown>> {
  const blog = await loadBlog();
  const loaded = await blog.loadPost(postsDir(), postId);
  if (!loaded) throw new Error(`postId bulunamadı: ${postId}`);
  const quality = blog.checkBlogQuality(loaded.post);
  const checklist = blog.runMatriksChecklist(loaded.post);
  const { filePath, day } = await blog.writeReviewMarkdown(reviewsDir(), {
    post: loaded.post,
    quality,
    checklist,
    blogMdPath,
  });
  log.info("review yazıldı", { filePath });
  return {
    ok: true,
    postId: loaded.post.id,
    reviewPath: filePath,
    day,
    percent: quality.percent,
    verdict: quality.verdict,
    checklistSummary: checklist.summary,
  };
}

export async function runtimeCallToolJson(
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (name) {
    case "refineBlog":
      return runtimeRefineBlog(args as { title: string; content: string; postId?: string });
    case "writeBlog":
      return runtimeWriteBlog(
        args as {
          title: string;
          content: string;
          keywords: string[];
          category: string;
          sourceTopics?: string[];
        }
      );
    case "checkBlog":
      return runtimeCheckBlog(String(args.postId));
    case "reviewBlog":
      return runtimeReviewBlog(
        String(args.postId),
        args.blogMdPath ? String(args.blogMdPath) : undefined
      );
    default:
      throw new Error(`tool-runtime: desteklenmeyen araç ${name}`);
  }
}

export async function ensureDirs(): Promise<void> {
  await mkdir(postsDir(), { recursive: true });
  await mkdir(reviewsDir(), { recursive: true });
  await writeFile(path.join(postsDir(), ".gitkeep"), "", "utf8").catch(() => undefined);
}
