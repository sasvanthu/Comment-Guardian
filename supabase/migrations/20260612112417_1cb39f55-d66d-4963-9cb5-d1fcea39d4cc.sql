
ALTER TABLE public.ai_analysis ADD COLUMN IF NOT EXISTS explanation text;

ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS failure_reason text;

UPDATE public.sync_jobs SET next_attempt_at = scheduled_for WHERE next_attempt_at IS NULL;

CREATE INDEX IF NOT EXISTS sync_jobs_drain_idx
  ON public.sync_jobs (next_attempt_at)
  WHERE status = 'queued';
