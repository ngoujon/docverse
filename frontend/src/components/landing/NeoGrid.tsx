export default function NeoGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] overflow-hidden [mask-image:linear-gradient(to_top,black,transparent)]"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(8,145,168,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(139,47,214,0.1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}
