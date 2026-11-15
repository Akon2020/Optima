-- Base des tests de bout en bout (D-062) : `optima_e2e`, distincte de la base
-- de développement `optima`. Elle est VIDÉE puis remplie de comptes de test à
-- chaque lancement de `pnpm test:e2e` : n'y mettez jamais de données utiles.
--
-- À lancer UNE fois, après scripts/db/setup-local.sql (les rôles optima_migrator
-- et optima_app existent déjà), avec le super-utilisateur PostgreSQL :
--
--   psql -U postgres -h localhost -f scripts/db/setup-e2e.sql
--
-- Aucun mot de passe n'est demandé ni écrit : les tests réutilisent ceux de
-- .env.local, en changeant seulement le nom de la base.

\set ON_ERROR_STOP on

CREATE DATABASE optima_e2e OWNER optima_migrator ENCODING 'UTF8';

\connect optima_e2e

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO optima_migrator;
GRANT USAGE ON SCHEMA public TO optima_app;

ALTER DEFAULT PRIVILEGES FOR ROLE optima_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO optima_app;
ALTER DEFAULT PRIVILEGES FOR ROLE optima_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO optima_app;

\echo 'Base optima_e2e prête. pnpm test:e2e la migre et la remplit à chaque lancement.'
