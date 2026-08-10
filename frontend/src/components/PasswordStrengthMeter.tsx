import { useTranslation } from "react-i18next";
import clsx from "clsx";

const COMMON_PATTERNS = /^(password|motdepasse|azerty|qwerty|123456|11111111|00000000)/i;

function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (COMMON_PATTERNS.test(pw)) score = Math.max(0, score - 3);
  return Math.min(4, score);
}

const LEVEL_STYLES = [
  { bar: "bg-red-500", text: "text-red-500" },
  { bar: "bg-orange-500", text: "text-orange-500" },
  { bar: "bg-amber-500", text: "text-amber-500" },
  { bar: "bg-cyan-500", text: "text-cyan-500" },
  { bar: "bg-emerald-500", text: "text-emerald-500" },
];

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const { t } = useTranslation();
  if (!password) return null;

  const score = scorePassword(password);
  const labels = [
    t("auth.strength.veryWeak"),
    t("auth.strength.weak"),
    t("auth.strength.medium"),
    t("auth.strength.strong"),
    t("auth.strength.veryStrong"),
  ];
  const style = LEVEL_STYLES[score];

  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={clsx(
              "h-1.5 flex-1 rounded-full transition-colors duration-200",
              i < score || (score === 0 && i === 0)
                ? clsx(style.bar, score > 0 && "shadow-neon-light")
                : "bg-surface-3"
            )}
          />
        ))}
      </div>
      <p className={clsx("mt-1 font-mono text-[10px] font-semibold uppercase tracking-wider", style.text)}>
        {labels[score]}
      </p>
    </div>
  );
}
