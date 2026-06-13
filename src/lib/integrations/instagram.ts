/**
 * Instagram integration — client-callable server functions.
 *
 * These thin wrappers expose the server-only module at
 * `src/server/integrations/instagram.ts` to the UI. All real work
 * (Graph API calls, comment ingestion, audit + health logging) lives
 * server-side; this file only marshals input/output.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthCtx = { supabase: { from: (t: string) => any }; userId: string };

export const testInstagramConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const mod = await import("@/server/integrations/instagram");
    return mod.testInstagramConnection();
  });

export const syncInstagramNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as AuthCtx;
    const mod = await import("@/server/integrations/instagram");
    return mod.syncInstagramForUser(supabase, userId);
  });

export const disconnectInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as AuthCtx;
    const mod = await import("@/server/integrations/instagram");
    await mod.disconnectInstagramForUser(supabase, userId);
    return { ok: true };
  });
