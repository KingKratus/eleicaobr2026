
-- 1) Restrict profiles SELECT to authenticated users
DROP POLICY IF EXISTS "Perfis são públicos para leitura" ON public.profiles;
CREATE POLICY "Perfis visíveis para autenticados"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.profiles FROM anon;

-- 2) Lock down user_roles: only admins can write
CREATE POLICY "Admin gerencia papéis - insert"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin gerencia papéis - update"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin gerencia papéis - delete"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Realtime: remove tables from publication to avoid unrestricted subscription
ALTER PUBLICATION supabase_realtime DROP TABLE public.boletins;
ALTER PUBLICATION supabase_realtime DROP TABLE public.totais_cargo;
ALTER PUBLICATION supabase_realtime DROP TABLE public.cobertura;
