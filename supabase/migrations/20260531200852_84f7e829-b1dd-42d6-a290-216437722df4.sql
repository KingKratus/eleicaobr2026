
-- Revoga EXECUTE público das funções SECURITY DEFINER expostas no schema public
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.agregar_totais_bu() FROM PUBLIC, anon, authenticated;

-- has_role precisa ser executável por authenticated (usada em policies)
-- mas as policies rodam como o usuário, então mantemos GRANT controlado
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
