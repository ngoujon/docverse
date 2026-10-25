import { Fragment, type ReactNode } from "react";

type Segment = { kind: "text"; text: string } | { kind: "cite"; n: number; before: string; after: string };

/** Closes a dangling "**" so a half-revealed bold run renders as bold. */
function balanceBold(text: string): string {
  return (text.match(/\*\*/g)?.length ?? 0) % 2 ? `${text}**` : text;
}

/**
 * Splits an answer into text and citation segments. Each citation takes
 * the word before it and the punctuation after it, so the badge can be
 * rendered glued to them: it never starts a line or strands a "." alone.
 */
function segment(text: string): Segment[] {
  const segments: Segment[] = [];
  let skip = 0; // leading punctuation already moved into the previous citation
  for (const part of text.split(/\s*(\[\d+\])/)) {
    const cite = part.match(/^\[(\d+)\]$/);
    if (!cite) {
      segments.push({ kind: "text", text: part.slice(skip) });
      skip = 0;
      continue;
    }
    const prev = segments[segments.length - 1];
    let before = "";
    if (prev?.kind === "text") {
      // A whole **bold run** if the text ends with one, else the last word.
      before = prev.text.match(/(\*\*[^*]+\*\*|\S+)$/)?.[1] ?? "";
      prev.text = prev.text.slice(0, prev.text.length - before.length);
    }
    segments.push({ kind: "cite", n: Number(cite[1]), before, after: "" });
  }
  // Second pass: pull punctuation following each citation into it.
  segments.forEach((seg, i) => {
    const next = segments[i + 1];
    if (seg.kind === "cite" && next?.kind === "text") {
      seg.after = next.text.match(/^[.,;:!?)]+/)?.[0] ?? "";
      next.text = next.text.slice(seg.after.length);
    }
  });
  return segments;
}

function renderBold(text: string, key: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${key}-${i}`} className="font-semibold text-fluent-navy">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={`${key}-${i}`}>{part}</Fragment>
    ),
  );
}

/**
 * Renders a scripted answer: **bold** runs and [n] citations as clickable
 * badges. `words` limits the output to the first N words, which is how the
 * typing effect is driven.
 */
export default function DemoAnswer({
  text,
  words,
  onCite,
}: {
  text: string;
  words?: number;
  onCite: (n: number) => void;
}) {
  const visible = words === undefined ? text : text.split(" ").slice(0, words).join(" ");
  return (
    <>
      {segment(balanceBold(visible)).map((seg, i) =>
        seg.kind === "text" ? (
          <Fragment key={i}>{renderBold(seg.text, `s${i}`)}</Fragment>
        ) : (
          <span key={i} className="whitespace-nowrap">
            {renderBold(seg.before, `b${i}`)}
            {" "}
            <button
              type="button"
              onClick={() => onCite(seg.n)}
              className="cite-badge cursor-pointer transition hover:bg-fluent-indigo hover:text-white"
              aria-label={`Source ${seg.n}`}
            >
              {seg.n}
            </button>
            {seg.after}
          </span>
        ),
      )}
    </>
  );
}
