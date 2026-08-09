export default function NeoGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] overflow-hidden [mask-image:linear-gradient(to_top,black,transparent)]"
    >
      <div
        className="absolute inset-0 animate-grid-scroll"
        style={{
          backgroundImage:
            "linear-gradient(rgba(8,145,168,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(224,28,192,0.25) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          transform: "perspective(300px) rotateX(60deg) scale(2)",
          transformOrigin: "bottom",
        }}
      />
    </div>
  );
}
