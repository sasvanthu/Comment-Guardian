
-- Review queue + moderator feedback
CREATE TYPE public.review_status AS ENUM ('pending','reviewed','approved','ignored','escalated');

ALTER TABLE public.comments
  ADD COLUMN review_status public.review_status NOT NULL DEFAULT 'pending';

CREATE INDEX comments_review_status_idx ON public.comments (user_id, review_status);

CREATE TYPE public.feedback_type AS ENUM ('correct','false_positive','wrong_category','missed_context');

CREATE TABLE public.moderator_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  feedback feedback_type NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX moderator_feedback_user_idx ON public.moderator_feedback (user_id, created_at DESC);
CREATE INDEX moderator_feedback_comment_idx ON public.moderator_feedback (comment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.moderator_feedback TO authenticated;
GRANT ALL ON public.moderator_feedback TO service_role;

ALTER TABLE public.moderator_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_owner_select" ON public.moderator_feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "feedback_owner_insert" ON public.moderator_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feedback_owner_delete" ON public.moderator_feedback
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.moderator_feedback;
