/**
 * Cron endpoint — drains the sync_jobs queue.
 * Invoked every minute by pg_cron. Authenticated by Supabase anon key.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/process-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") || request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { drainModerationJobs } = await import("@/lib/jobs/pipeline.server");

        // Drain up to a few batches per tick so a backlog burns down quickly.
        const stats = { claimed: 0, ok: 0, failed: 0, deadLetter: 0 };
        for (let i = 0; i < 3; i++) {
          const r = await drainModerationJobs(supabaseAdmin, 10);
          stats.claimed += r.claimed;
          stats.ok += r.ok;
          stats.failed += r.failed;
          stats.deadLetter += r.deadLetter;
          if (r.claimed === 0) break;
        }
        return Response.json({ ok: true, stats });
      },
    },
  },
});
