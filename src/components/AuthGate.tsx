import { useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { useAuth } from "@/hooks/use-auth";

const PUBLIC_PATHS = new Set(["/auth"]);

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isPublic = PUBLIC_PATHS.has(location.pathname);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) {
      navigate("/auth", { replace: true });
    } else if (user && isPublic) {
      navigate("/", { replace: true });
    }
  }, [user, loading, isPublic, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!user && !isPublic) return null;
  return <>{children}</>;
}
