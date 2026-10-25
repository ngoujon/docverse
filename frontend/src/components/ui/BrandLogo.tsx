import { useId } from "react";
import clsx from "clsx";
import { BRAND } from "../../brand";

/** Brand mark: a lowercase "d" monogram (document + knowledge ring) with a
 * small sparkle for the "verse", on the indigo-to-cyan gradient. Same drawing
 * as public/favicon.svg. */
export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={clsx("shrink-0", className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#635bff" />
          <stop offset="55%" stopColor="#5a7bff" />
          <stop offset="100%" stopColor="#00c4ff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
      <circle cx="15" cy="18.5" r="5.5" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M20.5 7.5V24" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M9.5 6.6Q9.95 9.05 12.4 9.5Q9.95 9.95 9.5 12.4Q9.05 9.95 6.6 9.5Q9.05 9.05 9.5 6.6Z" fill="#fff" />
    </svg>
  );
}

/** Mark + lowercase wordmark. The text inherits the parent's colour. */
export default function BrandLogo({ className, hideNameOnMobile }: { className?: string; hideNameOnMobile?: boolean }) {
  return (
    <span
      className={clsx("flex items-center gap-2.5 text-[1.35rem] font-bold leading-none tracking-[-0.045em]", className)}
    >
      <BrandMark className="h-7 w-7" />
      <span className={clsx("-mt-0.5", hideNameOnMobile && "hidden sm:inline")}>{BRAND.name.toLowerCase()}</span>
    </span>
  );
}
