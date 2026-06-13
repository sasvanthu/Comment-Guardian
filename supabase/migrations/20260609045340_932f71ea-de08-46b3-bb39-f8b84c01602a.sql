
CREATE TABLE IF NOT EXISTS public.ai_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL UNIQUE REFERENCES public.comments(id) ON DELETE CASCADE,
  sentiment text NOT NULL DEFAULT 'neutral',
  toxicity_score numeric(4,3) NOT NULL DEFAULT 0,
  harassment_score numeric(4,3) NOT NULL DEFAULT 0,
  spam_score numeric(4,3) NOT NULL DEFAULT 0,
  confidence_score numeric(4,3) NOT NULL DEFAULT 0,
  recommendation text NOT NULL DEFAULT 'allow',
  model text NOT NULL DEFAULT 'deepseek-chat',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_analysis TO authenticated;
GRANT ALL ON public.ai_analysis TO service_role;

ALTER TABLE public.ai_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_analysis_owner_select" ON public.ai_analysis
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ai_analysis_owner_insert" ON public.ai_analysis
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_analysis_owner_update" ON public.ai_analysis
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ai_analysis_owner_delete" ON public.ai_analysis
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS ai_analysis_user_created_idx
  ON public.ai_analysis(user_id, created_at DESC);

CREATE TRIGGER trg_ai_analysis_updated_at
  BEFORE UPDATE ON public.ai_analysis
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_analysis;
