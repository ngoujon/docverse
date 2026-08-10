import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { setUserToken } from "../api/userToken";
import { useAuth } from "../hooks/useAuth";

export default function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    const token = params.get("token");
    const next = params.get("next") || "/dashboard";
    if (!token) {
      navigate("/login?sso_error=1", { replace: true });
      return;
    }
    setUserToken(token);
    refresh().then(() => navigate(next, { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-[100dvh] w-screen items-center justify-center bg-surface-0">
      <Loader2 size={22} className="animate-spin text-accent" />
    </div>
  );
}
