/** Purely decorative, aria-hidden backgrounds of the landing page hero. */

/** Skewed multicolour band behind the hero (Fluent Corp signature),
 * fading out on the left so the headline stays on plain white. */
export function GradientStripe() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-[780px] h-[900px] origin-top-left -skew-y-12 opacity-90 sm:-top-[440px]"
      style={{
        background:
          "radial-gradient(40% 60% at 30% 70%, #a960ee 0%, transparent 70%)," +
          "radial-gradient(35% 60% at 55% 80%, #ff6b8b 0%, transparent 70%)," +
          "radial-gradient(35% 55% at 78% 70%, #ffcb57 0%, transparent 70%)," +
          "radial-gradient(40% 60% at 95% 60%, #90e0ff 0%, transparent 70%)," +
          "linear-gradient(90deg, #635bff, #a960ee 35%, #ff6b8b 60%, #ffcb57 82%, #90e0ff)",
        maskImage: "linear-gradient(90deg, transparent 10%, rgba(0,0,0,0.5) 45%, #000 70%)",
        WebkitMaskImage: "linear-gradient(90deg, transparent 10%, rgba(0,0,0,0.5) 45%, #000 70%)",
      }}
    />
  );
}
