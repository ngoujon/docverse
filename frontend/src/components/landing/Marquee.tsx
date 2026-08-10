export default function Marquee({ items }: { items: string[] }) {
  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-retro-border bg-slate-900 py-2">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap">
        {loop.map((item, i) => (
          <span
            key={i}
            className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-retro-cyan"
          >
            <span className="text-retro-pink">&#9670;</span>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
