CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

ALTER TABLE public.animatori
  ADD COLUMN IF NOT EXISTS gestisce_gioco boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS giorno_gioco text,
  ADD COLUMN IF NOT EXISTS nome_gioco text;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS id_animatore integer
  REFERENCES public.animatori(id_animatore) ON DELETE SET NULL;

ALTER TABLE public.push_subscriptions
  ALTER COLUMN preferences SET DEFAULT
    '{"grestManager":true,"grestActivities":true,"grestNotices":true,"grestLunchCount":true,"saborActivities":true,"saborNotices":true}'::jsonb;

UPDATE public.push_subscriptions
SET preferences = jsonb_build_object(
  'grestManager', COALESCE(preferences->'grestManager', 'true'::jsonb),
  'grestActivities', COALESCE(preferences->'grestActivities', 'true'::jsonb),
  'grestNotices', COALESCE(preferences->'grestNotices', 'true'::jsonb),
  'grestLunchCount', COALESCE(preferences->'grestLunchCount', 'true'::jsonb),
  'saborActivities', COALESCE(preferences->'saborActivities', preferences->'saborMeetings', 'true'::jsonb),
  'saborNotices', COALESCE(preferences->'saborNotices', 'true'::jsonb)
);

CREATE TABLE IF NOT EXISTS public.grest_push_schedule (
  id integer PRIMARY KEY CHECK (id = 1),
  start_date date,
  end_date date,
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

INSERT INTO public.grest_push_schedule (id, start_date, end_date)
VALUES (1, DATE '2027-06-14', NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.grest_push_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.grest_push_schedule FROM anon, authenticated;
GRANT ALL ON public.grest_push_schedule TO service_role;

CREATE TABLE IF NOT EXISTS public.grest_lunch_push_dispatches (
  dispatch_date date PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grest_lunch_push_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.grest_lunch_push_dispatches FROM anon, authenticated;
GRANT ALL ON public.grest_lunch_push_dispatches TO service_role;

DROP TRIGGER IF EXISTS push_animatore_gioco_update ON public.animatori;
CREATE TRIGGER push_animatore_gioco_update
AFTER UPDATE OF gestisce_gioco, giorno_gioco, nome_gioco ON public.animatori
FOR EACH ROW
WHEN (
  NEW.gestisce_gioco IS DISTINCT FROM OLD.gestisce_gioco
  OR NEW.giorno_gioco IS DISTINCT FROM OLD.giorno_gioco
  OR NEW.nome_gioco IS DISTINCT FROM OLD.nome_gioco
)
EXECUTE FUNCTION public.dispatch_push_notification();

CREATE OR REPLACE FUNCTION public.dispatch_grest_lunch_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  function_url text;
  request_secret text;
BEGIN
  SELECT decrypted_secret INTO function_url
  FROM vault.decrypted_secrets
  WHERE name = 'push_function_url'
  LIMIT 1;

  SELECT decrypted_secret INTO request_secret
  FROM vault.decrypted_secrets
  WHERE name = 'push_webhook_secret'
  LIMIT 1;

  IF function_url IS NULL OR request_secret IS NULL THEN
    RAISE WARNING 'Digest mensa non inviato: configurare push_function_url e push_webhook_secret in Supabase Vault.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-webhook-secret', request_secret
    ),
    body := jsonb_build_object('table', 'grest_lunch_digest'),
    timeout_milliseconds := 5000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_grest_lunch_digest() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'grest-lunch-digest';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'grest-lunch-digest',
    '15 7,8 * * 1-5',
    'SELECT public.dispatch_grest_lunch_digest()'
  );
END;
$$;
