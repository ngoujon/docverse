import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute({
  children,
  adminOnly,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-[100dvh] w-screen items-center justify-center bg-surface-0">
        <Loader2 size={22} className="animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (adminOnly && user.role !== "admin") return <Navigate to="/dashboard" replace />;

  // Two-factor authentication is mandatory for admin privileges - until one
  // is configured, the backend rejects every admin-only request, so send
  // the admin to set it up instead of letting them hit a dead-end 403.
  if (adminOnly && !user.totp_enabled) {
    return <Navigate to="/account" replace />;
  }

  return <>{children}</>;
}
