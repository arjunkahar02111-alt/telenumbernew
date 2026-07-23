REVOKE ALL ON public.search_logs FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.blocked_ips FROM anon;
REVOKE ALL ON public.active_warnings FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_logs TO authenticated;
GRANT ALL ON public.search_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_ips TO authenticated;
GRANT ALL ON public.blocked_ips TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_warnings TO authenticated;
GRANT ALL ON public.active_warnings TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;