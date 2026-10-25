/** Shapes of the scripted demo content (locales: demoApp.spaces). */

export type DemoDocType = "pdf" | "docx" | "image" | "web" | "audio" | "csv" | "md";

export interface DemoDoc {
  name: string;
  type: DemoDocType;
  size: string;
  chunks: number;
}

export interface DemoSource {
  /** Index in the space's documents (the uploaded one comes last). */
  doc: number;
  where: string;
  passage: string;
  /** Substring of `passage` shown highlighted in the source viewer. */
  highlight: string;
}

export interface DemoQA {
  q: string;
  /** Accent-free, lowercase words used to match typed questions. */
  keywords: string[];
  /** Markdown-lite: **bold** and [n] citations (1-based into `sources`). */
  answer: string;
  sources: DemoSource[];
}

export interface DemoSpace {
  name: string;
  short: string;
  color: string;
  desc: string;
  docs: DemoDoc[];
  qa: DemoQA[];
  upload: { doc: DemoDoc; qa: DemoQA };
}

export type UploadState = "idle" | "uploading" | "indexing" | "ready";

export type DemoMessage =
  | { id: number; role: "user"; text: string }
  | {
      id: number;
      role: "assistant";
      phase: "searching" | "found" | "writing" | "done";
      /** Null for the "outside the demo script" fallback answer. */
      qa: DemoQA | null;
      text: string;
      /** Words revealed so far while phase === "writing". */
      shown: number;
    };

/** The tour steps, in order (indexes into demoApp.tour.steps). */
export const STEP = { space: 0, ask: 1, source: 2, upload: 3, share: 4 } as const;
export type StepIndex = (typeof STEP)[keyof typeof STEP];
