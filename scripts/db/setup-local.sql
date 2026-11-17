-- Préparation de la base locale OPTIMA (D-016 : PostgreSQL natif sous Windows).
--
-- À lancer UNE fois, avec le super-utilisateur PostgreSQL, depuis la racine :
--
--   psql -U postgres -h localhost -f scripts/db/setup-local.sql
--
-- Le script demande les deux mots de passe à créer. Choisissez des mots de
-- passe longs et aléatoires (voir guides/guide.md), puis reportez-les dans
-- .env.local (jamais committé). Aucun mot de passe n'est écrit dans ce dépôt.

\set ON_ERROR_STOP on

-- Les mots de passe peuvent aussi être passés sans saisie :
--   psql ... -v migrator_password=... -v app_password=... -f scripts/db/setup-local.sql
\if :{?migrator_password}
\else
  \prompt 'Mot de passe à créer pour optima_migrator (migrations) : ' migrator_password
\endif
\if :{?app_password}
\else
  \prompt 'Mot de passe à créer pour optima_app (application) : ' app_password
\endif

-- Rôle des migrations : propriétaire du schéma.
CREATE ROLE optima_migrator LOGIN PASSWORD :'migrator_password';

-- Rôle de l'application : ni super-utilisateur, ni BYPASSRLS (CLAUDE.md § 3.8).
CREATE ROLE optima_app LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE DATABASE optima OWNER optima_migrator ENCODING 'UTF8';

\connect optima

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO optima_migrator;
GRANT USAGE ON SCHEMA public TO optima_app;

-- Les tables créées plus tard par les migrations restent accessibles à l'application
-- (les droits fins sont reposés par la migration 0002_security).
ALTER DEFAULT PRIVILEGES FOR ROLE optima_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO optima_app;
ALTER DEFAULT PRIVILEGES FOR ROLE optima_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO optima_app;

\echo 'Base optima prête. Lancez ensuite : pnpm db:migrate puis pnpm db:seed'
