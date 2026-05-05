-- P18.3 — Lock galaxy_v1_reference against routine UPDATE/DELETE (including service_role).
-- RLS was already enabled in P18.2; service_role bypasses RLS, so privileges must be revoked.
-- Initial load uses INSERT only. A deliberate universe reset should use a postgres-owner
-- migration or temporary GRANT, not the application service key.

REVOKE UPDATE, DELETE ON TABLE public.galaxy_v1_reference FROM service_role;

COMMENT ON TABLE public.galaxy_v1_reference IS
  'P18.2/P18.3: Frozen UMAP x,y + decimal-year z. INSERT allowed for bootstrap; '
  'UPDATE/DELETE revoked from service_role. Owner/superuser can still mutate for explicit reset.';
