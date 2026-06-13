import { useEffect, type ReactNode } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

const PUBLIC_PATHS = new Set(["/auth"]);

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { location } = useRouterState();
  const isPublic = PUBLIC_PATHS.has(location.pathname);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) {
      router.navigate({ to: "/auth", replace: true });
    } else if (user && isPublic) {
      router.navigate({ to: "/", replace: true });
    }
  }, [user, loading, isPublic, router]);

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
