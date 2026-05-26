-- 002_auth_allowlist.sql
-- Restringe acesso às tabelas da aplicação a utilizadores autenticados
-- cujo email esteja na allowlist (public.authorized_emails).

CREATE TABLE IF NOT EXISTS public.authorized_emails (
  email text PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.authorized_emails ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_authorized_emails_updated_at'
      AND tgrelid = 'public.authorized_emails'::regclass
  ) THEN
    CREATE TRIGGER trg_authorized_emails_updated_at
    BEFORE UPDATE ON public.authorized_emails
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_allowed_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.authorized_emails ae
      WHERE lower(ae.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
        AND ae.active = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_allowed_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_allowed_user() TO anon, authenticated, service_role;

-- Na própria allowlist, o utilizador autenticado só pode ver o seu registo.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'authorized_emails'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.authorized_emails', pol.policyname);
  END LOOP;

  CREATE POLICY authorized_emails_self_select
    ON public.authorized_emails
    FOR SELECT
    TO authenticated
    USING (
      lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      OR auth.role() = 'service_role'
    );
END;
$$;

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stay_certified',
    'stay_certified_notas',
    'planeamento',
    'planeamento_notas',
    'indicadores'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_allowed_user())',
        t || '_allowed_select',
        t
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_allowed_user())',
        t || '_allowed_insert',
        t
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_allowed_user()) WITH CHECK (public.is_allowed_user())',
        t || '_allowed_update',
        t
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_allowed_user())',
        t || '_allowed_delete',
        t
      );

      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
  END LOOP;
END;
$$;

-- Exemplos (executar/ajustar conforme necessário):
-- INSERT INTO public.authorized_emails (email, active) VALUES
--   ('nome.apelido@empresa.com', true),
--   ('outra.pessoa@empresa.com', true)
-- ON CONFLICT (email) DO UPDATE SET active = EXCLUDED.active;
