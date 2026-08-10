/**
 * Renders streamed text with each word fading/dissolving in as it appears,
 * instead of popping in abruptly. Splitting by index-stable array position
 * means words already on screen keep the same React key as more text is
 * appended, so their fade-in never restarts - only newly appended words
 * animate.
 */
export default function AnimatedText({ text, animate = true }: { text: string; animate?: boolean }) {
  if (!animate) return <>{text}</>;

  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((part, i) =>
        /^\s+$/.test(part) ? (
          part
        ) : (
          <span key={i} className="inline-block animate-word-fade-in">
            {part}
          </span>
        )
      )}
    </>
  );
}
