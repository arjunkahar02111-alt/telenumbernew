GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_logs TO authenticated;
GRANT ALL ON public.search_logs TO service_role;

GRANT SELECT ON public.blocked_ips TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_ips TO authenticated;
GRANT ALL ON public.blocked_ips TO service_role;

GRANT SELECT ON public.active_warnings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_warnings TO authenticated;
GRANT ALL ON public.active_warnings TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;