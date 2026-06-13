
-- =========================================================================
-- ENUMS
-- =========================================================================
DO $$ BEGIN
  CREATE TYPE public.review_queue_status AS ENUM
    ('pending','assigned','reviewed','approved','ignored','escalated','resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.review_priority AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.moderation_action_type AS ENUM
    ('approve','reject','hide','delete','escalate','reassign','blacklist','whitelist','bypass','restore','note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_severity AS ENUM ('info','success','warning','danger');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.case_status AS ENUM ('open','investigating','escalated','closed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sync_job_status AS ENUM
    ('queued','running','succeeded','failed','dead_letter','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_health_status AS ENUM ('healthy','degraded','down','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- review_queue
-- =========================================================================
CREATE TABLE public.review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  status public.review_queue_status NOT NULL DEFAULT 'pending',
  priority public.review_priority NOT NULL DEFAULT 'medium',
  risk_score numeric NOT NULL DEFAULT 0,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_queue TO authenticated;
GRANT ALL ON public.review_queue TO service_role;
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own review_queue" ON public.review_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX review_queue_user_status_idx ON public.review_queue (user_id, status, priority DESC, created_at DESC);
CREATE INDEX review_queue_assignee_idx ON public.review_queue (assignee_id) WHERE assignee_id IS NOT NULL;
CREATE TRIGGER review_queue_set_updated_at
  BEFORE UPDATE ON public.review_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- moderation_actions
-- =========================================================================
CREATE TABLE public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  review_queue_id uuid REFERENCES public.review_queue(id) ON DELETE SET NULL,
  action public.moderation_action_type NOT NULL,
  reason text,
  previous_state jsonb,
  new_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.moderation_actions TO authenticated;
GRANT ALL ON public.moderation_actions TO service_role;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own moderation_actions read" ON public.moderation_actions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own moderation_actions insert" ON public.moderation_actions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX moderation_actions_user_created_idx ON public.moderation_actions (user_id, created_at DESC);
CREATE INDEX moderation_actions_comment_idx ON public.moderation_actions (comment_id);

-- =========================================================================
-- audit_logs (immutable)
-- =========================================================================
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  previous_state jsonb,
  new_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own audit read" ON public.audit_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own audit insert" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No UPDATE/DELETE policies => append-only for authenticated users.
CREATE INDEX audit_logs_user_created_idx ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_action_idx ON public.audit_logs (action);

-- =========================================================================
-- notifications
-- =========================================================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  severity public.notification_severity NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);

-- =========================================================================
-- cases  +  case_comments
-- =========================================================================
CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text,
  status public.case_status NOT NULL DEFAULT 'open',
  severity public.review_priority NOT NULL DEFAULT 'medium',
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject_author text,
  subject_platform text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cases" ON public.cases
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX cases_user_status_idx ON public.cases (user_id, status, created_at DESC);
CREATE TRIGGER cases_set_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.case_comments (
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, comment_id)
);
GRANT SELECT, INSERT, DELETE ON public.case_comments TO authenticated;
GRANT ALL ON public.case_comments TO service_role;
ALTER TABLE public.case_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own case_comments" ON public.case_comments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX case_comments_comment_idx ON public.case_comments (comment_id);

-- =========================================================================
-- sync_jobs (durable queue w/ retries + dead-letter)
-- =========================================================================
CREATE TABLE public.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  status public.sync_job_status NOT NULL DEFAULT 'queued',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  parent_job_id uuid REFERENCES public.sync_jobs(id) ON DELETE SET NULL,
  related_comment_id uuid REFERENCES public.comments(id) ON DELETE SET NULL,
  related_connection_id uuid REFERENCES public.platform_connections(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_jobs TO authenticated;
GRANT ALL ON public.sync_jobs TO service_role;
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sync_jobs" ON public.sync_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Drainer-friendly index: claim next ready job
CREATE INDEX sync_jobs_ready_idx
  ON public.sync_jobs (scheduled_for)
  WHERE status = 'queued';
CREATE INDEX sync_jobs_user_status_idx ON public.sync_jobs (user_id, status, created_at DESC);
CREATE INDEX sync_jobs_dead_letter_idx ON public.sync_jobs (user_id, created_at DESC) WHERE status = 'dead_letter';
CREATE TRIGGER sync_jobs_set_updated_at
  BEFORE UPDATE ON public.sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- platform_health
-- =========================================================================
CREATE TABLE public.platform_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  platform text NOT NULL,
  status public.platform_health_status NOT NULL DEFAULT 'unknown',
  latency_ms integer,
  error_rate numeric,
  success_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_error text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_health TO authenticated;
GRANT ALL ON public.platform_health TO service_role;
ALTER TABLE public.platform_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own platform_health" ON public.platform_health
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX platform_health_user_observed_idx ON public.platform_health (user_id, platform, observed_at DESC);

-- =========================================================================
-- api_usage (per user / day / service)
-- =========================================================================
CREATE TABLE public.api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service text NOT NULL,            -- e.g. 'deepseek', 'youtube', 'reddit'
  operation text,                   -- e.g. 'analyze', 'fetch_comments'
  units integer NOT NULL DEFAULT 1, -- tokens / requests
  cost_estimate numeric NOT NULL DEFAULT 0,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, service, operation, day)
);
GRANT SELECT, INSERT, UPDATE ON public.api_usage TO authenticated;
GRANT ALL ON public.api_usage TO service_role;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own api_usage" ON public.api_usage
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX api_usage_user_day_idx ON public.api_usage (user_id, day DESC, service);

-- =========================================================================
-- Supporting indexes on existing tables (perf for 100k+ comments)
-- =========================================================================
CREATE INDEX IF NOT EXISTS comments_user_created_idx
  ON public.comments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_user_review_status_idx
  ON public.comments (user_id, review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_user_platform_idx
  ON public.comments (user_id, platform, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS comments_user_external_uniq
  ON public.comments (user_id, platform, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_analysis_user_created_idx
  ON public.ai_analysis (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_analysis_comment_idx
  ON public.ai_analysis (comment_id);
CREATE INDEX IF NOT EXISTS ai_analysis_user_priority_idx
  ON public.ai_analysis (user_id, priority, risk_score DESC);

CREATE INDEX IF NOT EXISTS workflow_executions_user_created_idx
  ON public.workflow_executions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_executions_rule_idx
  ON public.workflow_executions (rule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_user_created_idx
  ON public.activity_logs (user_id, created_at DESC);
