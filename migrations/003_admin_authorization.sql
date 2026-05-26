-- 003_admin_authorization.sql
-- Adiciona perfil admin na allowlist e permite gestão da whitelist por admins.

ALTER TABLE public.authorized_emails
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_admin_user()
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
        AND COALESCE(ae.is_admin, false) = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO anon, authenticated, service_role;

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

  CREATE POLICY authorized_emails_select_self_or_admin
    ON public.authorized_emails
    FOR SELECT
    TO authenticated
    USING (
      lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      OR public.is_admin_user()
    );

  CREATE POLICY authorized_emails_admin_insert
    ON public.authorized_emails
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin_user());

  CREATE POLICY authorized_emails_admin_update
    ON public.authorized_emails
    FOR UPDATE
    TO authenticated
    USING (public.is_admin_user())
    WITH CHECK (public.is_admin_user());

  CREATE POLICY authorized_emails_admin_delete
    ON public.authorized_emails
    FOR DELETE
    TO authenticated
    USING (public.is_admin_user());
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.authorized_emails TO authenticated;
REVOKE ALL ON TABLE public.authorized_emails FROM anon;

-- Exemplo: tornar um utilizador admin
-- UPDATE public.authorized_emails
-- SET is_admin = true
-- WHERE lower(email) = lower('admin@empresa.com');
