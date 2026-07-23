
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "users view own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admins view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Search logs
CREATE TABLE public.search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  tg_id text NOT NULL,
  found boolean NOT NULL DEFAULT false,
  phone text,
  country text,
  country_code text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_logs_ip_idx ON public.search_logs(ip);
CREATE INDEX search_logs_created_idx ON public.search_logs(created_at DESC);
GRANT SELECT ON public.search_logs TO authenticated;
GRANT ALL ON public.search_logs TO service_role;
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view all logs"
  ON public.search_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Blocked IPs
CREATE TABLE public.blocked_ips (
  ip text PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- anon needs SELECT so the lookup endpoint (called with publishable key) can check block status
GRANT SELECT ON public.blocked_ips TO anon, authenticated;
GRANT ALL ON public.blocked_ips TO service_role;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read blocks"
  ON public.blocked_ips FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "admins manage blocks"
  ON public.blocked_ips FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Active warnings
CREATE TABLE public.active_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX active_warnings_ip_idx ON public.active_warnings(ip);
GRANT SELECT ON public.active_warnings TO anon, authenticated;
GRANT ALL ON public.active_warnings TO service_role;
ALTER TABLE public.active_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read warnings"
  ON public.active_warnings FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "admins manage warnings"
  ON public.active_warnings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
