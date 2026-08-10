import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Loader2 } from "lucide-react";
import { api } from "../api/client";
import { sha256Hex } from "../utils/sha256";
import type { CaptchaSolution } from "../types";

interface Props {
  onReady: (solution: CaptchaSolution | null) => void;
}

// Solves the self-hosted proof-of-work challenge (see backend
// services/captcha.py) entirely client-side: no external captcha service,
// consistent with the app running 100% locally. Runs in small chunks via
// setTimeout so the UI thread never freezes even at higher difficulty.
export default function Captcha({ onReady }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"loading" | "solving" | "ready" | "error">("loading");
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    setStatus("loading");
    onReady(null);

    api
      .captchaChallenge()
      .then(({ salt, difficulty }) => {
        if (cancelled.current) return;
        setStatus("solving");
        const target = "0".repeat(difficulty);
        let nonce = 0;

        const step = () => {
          if (cancelled.current) return;
          const chunkEnd = nonce + 20000;
          for (; nonce < chunkEnd; nonce++) {
            if (sha256Hex(`${salt}:${nonce}`).startsWith(target)) {
              setStatus("ready");
              onReady({ captcha_salt: salt, captcha_nonce: nonce });
              return;
            }
          }
          setTimeout(step, 0);
        };
        step();
      })
      .catch(() => setStatus("error"));

    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-xs">
      {status === "ready" ? (
        <ShieldCheck size={15} className="shrink-0 text-emerald-500" />
      ) : status === "error" ? (
        <ShieldCheck size={15} className="shrink-0 text-red-500" />
      ) : (
        <Loader2 size={15} className="shrink-0 animate-spin text-slate-500 dark:text-slate-400" />
      )}
      <span className="text-slate-600 dark:text-slate-400">
        {status === "loading" && t("captcha.loading")}
        {status === "solving" && t("captcha.solving")}
        {status === "ready" && t("captcha.ready")}
        {status === "error" && t("captcha.error")}
      </span>
    </div>
  );
}
