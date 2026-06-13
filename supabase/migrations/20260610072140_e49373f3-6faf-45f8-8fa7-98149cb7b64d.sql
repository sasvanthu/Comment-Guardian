
-- 1. Extend ai_analysis with expanded taxonomy + risk
ALTER TABLE public.ai_analysis
  ADD COLUMN IF NOT EXISTS scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS emotions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_score numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS reason text;

CREATE INDEX IF NOT EXISTS ai_analysis_risk_idx
  ON public.ai_analysis (user_id, risk_score DESC);

-- 2. workflow_rules
CREATE TABLE IF NOT EXISTS public.workflow_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  -- conditions: { all?: Condition[], any?: Condition[] }
  -- Condition: { field: string, op: 'gte'|'lte'|'gt'|'lt'|'eq'|'neq'|'in'|'contains', value: any }
  conditions jsonb NOT NULL DEFAULT '{"all":[]}'::jsonb,
  -- actions: Action[] where Action: { type: 'hide'|'flag'|'review'|'set_status'|'set_category'|'notify'|'log', params?: object }
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  run_count int NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_rules TO authenticated;
GRANT ALL ON public.workflow_rules TO service_role;

ALTER TABLE public.workflow_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wfr_owner_select" ON public.workflow_rules FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "wfr_owner_insert" ON public.workflow_rules FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wfr_owner_update" ON public.workflow_rules FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "wfr_owner_delete" ON public.workflow_rules FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_workflow_rules_updated_at
  BEFORE UPDATE ON public.workflow_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. workflow_executions
CREATE TABLE IF NOT EXISTS public.workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.workflow_rules(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.comments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'success', -- success | error | skipped
  actions_taken jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.workflow_executions TO authenticated;
GRANT ALL ON public.workflow_executions TO service_role;

ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wfx_owner_select" ON public.workflow_executions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "wfx_owner_insert" ON public.workflow_executions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS wfx_user_created_idx
  ON public.workflow_executions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wfx_rule_idx
  ON public.workflow_executions (rule_id, created_at DESC);
