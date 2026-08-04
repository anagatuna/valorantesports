-- Migración para la pantalla de eventos y su relación con los partidos.
-- Correr en Supabase → SQL Editor. Es idempotente: se puede repetir sin romper nada.

-- ---------------------------------------------------------------
-- 1) events
-- ---------------------------------------------------------------
-- `id` es el id del evento en vlr.gg ("2776"), el mismo que usa la URL
-- vlr.gg/event/2776. Lo usamos como PK para que la FK desde `matches` sea
-- estable aunque el torneo se renombre a mitad de temporada.
--
-- status: ongoing | upcoming | completed | paused  (tal cual lo publica la API)
-- dates y prizepool van como texto porque la fuente los da ya formateados
-- ("Jul 15 Sep 6", "250000") y no hay garantía de formato para parsearlos.

CREATE TABLE IF NOT EXISTS events (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  status     text,
  prizepool  text,
  dates      text,
  country    text,
  img        text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_status_idx ON events (status);

-- ---------------------------------------------------------------
-- 2) matches: relación con el evento
-- ---------------------------------------------------------------
-- event_id    -> FK real contra events.id
-- event_name  -> nombre desnormalizado del torneo. Lo guardamos aparte para
--                que la card pueda pintar el nombre aunque el evento todavía
--                no esté sincronizado, y para no obligar a un join en cada
--                consulta de la home.
-- match_stage -> la fase dentro del torneo ("Group Stage–Week 3"), que es lo
--                que vlr.gg muestra debajo del nombre del evento.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS event_id    text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS event_name  text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_stage text;

-- La FK se agrega aparte y con NOT VALID: hay 1100+ filas existentes con
-- event_id NULL y así el ALTER no tiene que escanearlas. Las filas nuevas sí
-- se validan. Cuando el sync haya rellenado todo se puede validar con:
--   ALTER TABLE matches VALIDATE CONSTRAINT matches_event_id_fkey;
--
-- ON DELETE SET NULL: si se borra un evento preferimos huérfanos con nombre
-- que perder el partido.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_event_id_fkey'
  ) THEN
    ALTER TABLE matches
      ADD CONSTRAINT matches_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES events(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS matches_event_id_idx ON matches (event_id);

-- ---------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------
-- Dejamos `events` como está hoy `teams`: sin RLS, porque el scraper escribe
-- con la anon key cuando se corre en local. Es la misma contrapartida que ya
-- documenta 002_players_rls.sql — la anon key va pública en el bundle, así que
-- cualquiera podría escribir.
--
-- Si prefieres cerrarlo, descomenta el bloque de abajo Y asegúrate de que el
-- scraper corra siempre con service_role (en GitHub Actions ya lo hace vía el
-- secret SUPABASE_KEY; en local tendrías que ponerlo en .env.local).
--
-- ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "events lectura publica" ON events;
-- CREATE POLICY "events lectura publica" ON events FOR SELECT USING (true);
