-- Sécurité de la base (CLAUDE.md § 3.8 et § 5.3)
--
-- 1. Sécurité au niveau des lignes (RLS) : défense en profondeur, en plus du
--    contrôle applicatif `authorize`. Chaque transaction applicative pose
--    `app.establishment_id` (et `app.is_owner` après vérification du rôle
--    propriétaire) par set_config(..., true), c'est-à-dire SET LOCAL.
-- 2. Tables en ajout seul : un trigger refuse UPDATE et DELETE.
-- 3. Droits minimaux du rôle applicatif `optima_app` (sans BYPASSRLS).
--
-- Les tables d'identité (users, sessions, memberships, devices,
-- login_attempts, recovery_codes, establishments) n'ont pas de RLS : elles
-- sont lues avant qu'un établissement soit choisi (connexion, appareil), et
-- uniquement par les modules src/server/auth et src/server/authz.

CREATE OR REPLACE FUNCTION app_establishment_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.establishment_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_is_owner() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('app.is_owner', true), '') = 'true' $$;

-- ─── RLS des tables métier ──────────────────────────────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'establishment_modules',
    'establishment_settings',
    'service_points',
    'menu_items',
    'dining_tables',
    'table_releases',
    'orders',
    'advance_invoices',
    'invoice_lines',
    'morning_stock_entries',
    'sync_operations',
    'change_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    -- Lecture : l'établissement du contexte, ou tous pour le propriétaire.
    -- Écriture : uniquement l'établissement du contexte.
    EXECUTE format(
      'CREATE POLICY establishment_isolation ON %I
         USING (establishment_id = app_establishment_id() OR app_is_owner())
         WITH CHECK (establishment_id = app_establishment_id())',
      t
    );
  END LOOP;
END $$;

-- Journal d'audit : les événements sans établissement (connexions) sont
-- permis en écriture ; la lecture suit la même règle que les tables métier.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_isolation ON audit_log
  USING (establishment_id = app_establishment_id() OR app_is_owner())
  WITH CHECK (establishment_id IS NULL OR establishment_id = app_establishment_id());

-- ─── Tables en ajout seul (RG-STK-01, RG-AUD-01, RG-OFF-01) ────────────────

CREATE OR REPLACE FUNCTION forbid_update_delete() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'La table % est en ajout seul : % refusé.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_log',
    'change_log',
    'sync_operations',
    'morning_stock_entries',
    'table_releases',
    'invoice_lines'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION forbid_update_delete()',
      t || '_append_only',
      t
    );
  END LOOP;
END $$;

-- ─── Droits du rôle applicatif ──────────────────────────────────────────────
-- Le rôle est créé hors migration (scripts/db/setup-local.sql en local).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'optima_app') THEN
    GRANT USAGE ON SCHEMA public TO optima_app;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO optima_app;
    -- Aucune suppression de données métier : seules les sessions et les
    -- tentatives de connexion expirées peuvent être purgées.
    GRANT DELETE ON sessions, login_attempts TO optima_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO optima_app;
    GRANT EXECUTE ON FUNCTION app_establishment_id(), app_is_owner() TO optima_app;
  END IF;
END $$;
