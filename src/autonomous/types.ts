/** Autonomous Financial Editor Pipeline — ortak tipler */

export type PipelineTrigger = "cron" | "http" | "cli";

export interface PipelineConfig {
  everyDays: number;
  hour: number;
  minute: number;
  cron: string;
  scoreThreshold: number;
  /** Self-correction üst sınırı (varsayılan 3) */
  maxRevisions: number;
  category: string;
  keywords: string[];
  sourceTopics: string[];
  httpPort: number;
}

export interface TriggerPayload {
  /** true ise everyDays kapısı atlanır */
  force?: boolean;
  sourceTopics?: string[];
  keywords?: string[];
  category?: string;
  titleHint?: string;
  /** Quantex / dış sistem kimliği */
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface WriterInput {
  sourceTopics: string[];
  topicContents: Record<string, string>;
  keywords: string[];
  category: string;
  titleHint?: string;
  /** Editörden gelen önceki bulgular (self-correction) */
  editorFeedback?: EditorReport | null;
  revision: number;
}

export interface WriterOutput {
  title: string;
  content: string;
  keywords: string[];
  category: string;
  sourceTopics: string[];
  postId: string;
  status: string;
  wordCount: number;
  skill: "writer";
}

export interface EditorFinding {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  area?: string;
}

/** Editör ajanının JSON çıktısı — Yazar'a geri beslenir */
export interface EditorReport {
  postId: string;
  score: number;
  maxScore: number;
  percent: number;
  verdict: "ready" | "needs_revision" | "reject";
  findings: EditorFinding[];
  checklistSummary?: {
    pass: number;
    fail: number;
    warn: number;
    total: number;
  };
  revisionHints: string[];
  skill: "editor";
}

export interface PipelineResult {
  ok: boolean;
  trigger: PipelineTrigger;
  postId?: string;
  blogPath?: string;
  reviewPath?: string;
  percent?: number;
  verdict?: string;
  revisions: number;
  error?: string;
  startedAt: string;
  finishedAt: string;
}
