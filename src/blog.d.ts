/**
 * blog.js tip bildirimleri
 */
export declare const CATEGORIES: readonly string[];
export declare const MIN_WORDS: number;
export declare const MAX_WORDS: number;
export declare const LEGAL_BLOCK: string;

export declare function ensurePostsDir(postsDir: string): Promise<void>;
export declare function countWords(text: string): number;

export declare function writeBlog(
  postsDir: string,
  input: {
    title: string;
    content: string;
    keywords: string[];
    category: string;
    sourceTopics?: string[];
  }
): Promise<{
  record: {
    id: string;
    title: string;
    content: string;
    keywords: string[];
    category: string;
    sourceTopics: string[];
    wordCount: number;
    status: string;
    errors: string[];
    warnings: string[];
    createdAt: string;
    updatedAt: string;
  };
  filePath: string;
}>;

export declare function loadPost(
  postsDir: string,
  postId: string
): Promise<{
  post: {
    id: string;
    title: string;
    content: string;
    keywords: string[];
    category: string;
    status: string;
    wordCount?: number;
  };
  filePath: string;
} | null>;

export declare function checkBlogQuality(post: {
  title: string;
  content: string;
  keywords: string[];
  category: string;
}): {
  wordCount: number;
  score: number;
  maxScore: number;
  percent: number;
  verdict: string;
  dimensions: Array<{
    area: string;
    score: number;
    max: number;
    notes: string[];
  }>;
  notes: string[];
  checklist: Record<string, unknown>;
};

export declare function refineBlog(input: {
  title: string;
  content: string;
  keywords?: string[];
}): {
  title: string;
  content: string;
  changes: string[];
  skill: string;
};

export declare function runMatriksChecklist(post: {
  title: string;
  content: string;
  keywords?: string[];
  wordCount?: number;
}): {
  items: Array<{
    id: number;
    text: string;
    status: "pass" | "fail" | "warn";
    detail?: string;
  }>;
  summary: { pass: number; fail: number; warn: number; total: number };
};

export declare function writeReviewMarkdown(
  reviewsDir: string,
  input: {
    post: { id: string; title: string };
    quality: {
      score: number;
      maxScore: number;
      percent: number;
      verdict: string;
      wordCount: number;
      notes?: string[];
    };
    checklist: ReturnType<typeof runMatriksChecklist>;
    blogMdPath?: string;
  }
): Promise<{ filePath: string; day: string }>;

export declare function updatePostContent(
  postsDir: string,
  postId: string,
  refined: { title: string; content: string }
): Promise<{ post: Record<string, unknown>; filePath: string } | null>;
