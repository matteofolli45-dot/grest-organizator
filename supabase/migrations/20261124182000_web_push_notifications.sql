CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  preferences jsonb NOT NULL DEFAULT '{"grestActivities":true,"grestNotices":true,"saborMeetings":true,"saborNotices":true}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL
  DEFAULT '{"grestActivities":true,"grestNotices":true,"saborMeetings":true,"saborNotices":true}'::jsonb;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  function_url text;
  request_secret text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'programmazione' THEN
      IF OLD.data_attivita IS NOT DISTINCT FROM NEW.data_attivita
        AND OLD.fascia IS NOT DISTINCT FROM NEW.fascia
        AND OLD.nome_attivita IS NOT DISTINCT FROM NEW.nome_attivita THEN
        RETURN NEW;
      END IF;
    ELSIF TG_TABLE_NAME = 'sabor_incontri' THEN
      IF OLD.data IS NOT DISTINCT FROM NEW.data
        AND OLD.titolo_attivita IS NOT DISTINCT FROM NEW.titolo_attivita THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  SELECT decrypted_secret INTO function_url
  FROM vault.decrypted_secrets
  WHERE name = 'push_function_url'
  LIMIT 1;

  SELECT decrypted_secret INTO request_secret
  FROM vault.decrypted_secrets
  WHERE name = 'push_webhook_secret'
  LIMIT 1;

  IF function_url IS NULL OR request_secret IS NULL THEN
    RAISE WARNING 'Push non inviata: configurare push_function_url e push_webhook_secret in Supabase Vault.';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-webhook-secret', request_secret
    ),
    body := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'record', to_jsonb(NEW)
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_push_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS push_programmazione_insert ON public.programmazione;
CREATE TRIGGER push_programmazione_insert
AFTER INSERT ON public.programmazione
FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_notification();

DROP TRIGGER IF EXISTS push_programmazione_update ON public.programmazione;
CREATE TRIGGER push_programmazione_update
AFTER UPDATE OF data_attivita, fascia, nome_attivita ON public.programmazione
FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_notification();

DROP TRIGGER IF EXISTS push_sabor_incontri_insert ON public.sabor_incontri;
CREATE TRIGGER push_sabor_incontri_insert
AFTER INSERT ON public.sabor_incontri
FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_notification();

DROP TRIGGER IF EXISTS push_sabor_incontri_update ON public.sabor_incontri;
CREATE TRIGGER push_sabor_incontri_update
AFTER UPDATE OF data, titolo_attivita ON public.sabor_incontri
FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_notification();

DROP TRIGGER IF EXISTS push_avvisi_insert ON public.avvisi;
CREATE TRIGGER push_avvisi_insert
AFTER INSERT ON public.avvisi
FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_notification();

DROP TRIGGER IF EXISTS push_avvisi_sabor_insert ON public.avvisi_sabor;
CREATE TRIGGER push_avvisi_sabor_insert
AFTER INSERT ON public.avvisi_sabor
FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_notification();
