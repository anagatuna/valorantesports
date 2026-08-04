-- Migración para guardar rosters con foto de jugador.
-- Correr en Supabase → SQL Editor. Es idempotente: se puede repetir sin romper nada.

-- ---------------------------------------------------------------
-- 1) teams: campos nuevos
-- ---------------------------------------------------------------
-- vlr_id  -> id del equipo en vlr.gg ("120"). Es la llave real para cruzar
--            con los jugadores. `name` se mantiene como clave de upsert para
--            no romper el scraper viejo ni las filas existentes.
-- tag     -> abreviatura ("100T"), la usa el mockup del juego.
-- country -> país de origen ("United States").

-- partner -> true si el equipo compite en una liga VCT (Americas/EMEA/
--            Pacific/China). Es lo que permite mostrar sólo los equipos
--            asociados, como la sección de esports del juego.
-- league  -> nombre de la liga de la que salió la marca de partner.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS vlr_id  text;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS tag     text;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS partner boolean NOT NULL DEFAULT false;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS league  text;

CREATE INDEX IF NOT EXISTS teams_partner_idx ON teams (partner) WHERE partner;

CREATE UNIQUE INDEX IF NOT EXISTS teams_vlr_id_key ON teams (vlr_id)
  WHERE vlr_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS teams_region_idx ON teams (region);

-- La columna `roster` (texto JSON) queda obsoleta: la reemplaza la tabla
-- players. No se borra todavía para no perder datos si algo sale mal.
-- Cuando confirmes que players está poblada:
--     ALTER TABLE teams DROP COLUMN roster;


-- ---------------------------------------------------------------
-- 2) players: tabla nueva
-- ---------------------------------------------------------------
-- id        -> id del jugador en vlr.gg ("20140"). PK natural.
-- team_vlr_id -> a qué equipo pertenece (cruza con teams.vlr_id).
-- user      -> nick en juego ("vora")
-- name      -> nombre real ("Jordan Pulwer")
-- img       -> foto del jugador (esto es lo que faltaba)
-- country   -> código ISO en minúsculas ("ca")
-- role      -> 'player' | 'staff' | 'inactive'
-- staff_tag -> sólo para staff: 'head coach', 'assistant coach', 'manager'...

CREATE TABLE IF NOT EXISTS players (
  id          text PRIMARY KEY,
  team_vlr_id text,
  "user"      text,
  name        text,
  img         text,
  country     text,
  role        text NOT NULL DEFAULT 'player',
  staff_tag   text,
  url         text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS players_team_idx ON players (team_vlr_id);
CREATE INDEX IF NOT EXISTS players_role_idx ON players (role);


-- ---------------------------------------------------------------
-- 3) Permisos (RLS)
-- ---------------------------------------------------------------
-- `players` queda SIN RLS, igual que la tabla `teams` que ya tenés.
--
-- Motivo: el scraper corre con la clave `anon` (es la única configurada en
-- .env.local). Con RLS activo y sólo una política de SELECT, el upsert
-- fallaría por violación de política.
--
-- Contrapartida: cualquiera con la anon key —que va pública en el bundle del
-- navegador— puede escribir en esta tabla. Tu tabla `teams` ya está así hoy.
--
-- Para cerrarlo correctamente:
--   1. En Supabase → Settings → API, copiá la service_role key.
--   2. Guardala como SUPABASE_KEY en .env.local y en los secrets del repo.
--   3. Descomentá el bloque de abajo y corré esta migración de nuevo.
--      La service_role key ignora RLS, así que el scraper sigue escribiendo,
--      pero el público sólo puede leer.
--
-- ALTER TABLE players ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "players lectura publica" ON players;
-- CREATE POLICY "players lectura publica"
--   ON players FOR SELECT
--   USING (true);
