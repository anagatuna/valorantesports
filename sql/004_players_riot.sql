-- Fotos oficiales de Riot para los jugadores.
-- Correr en Supabase → SQL Editor. Es idempotente: se puede repetir.
--
-- Las fotos del cliente de VALORANT son material propio de Riot (sesión de
-- estudio del media day de cada liga). No sustituyen a las de vlr.gg: se
-- guardan APARTE, en `riot_img`, y la UI las prefiere cuando existen.
--
-- Razón de no pisar `img`:
--   - el scraper de vlr.gg (scrape_roster.mjs) sigue corriendo y volvería a
--     sobreescribirla en la siguiente pasada;
--   - si Riot cambia de CDN o borra un asset, queda el respaldo de vlr.gg;
--   - se puede revertir con un UPDATE ... SET riot_img = NULL.

ALTER TABLE players ADD COLUMN IF NOT EXISTS riot_img text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS riot_id  text;

-- Para poder cruzar de vuelta sin rehacer el emparejamiento por nick.
CREATE UNIQUE INDEX IF NOT EXISTS players_riot_id_key ON players (riot_id)
  WHERE riot_id IS NOT NULL;

-- Mismo par en teams: el id de Riot es la llave estable del equipo, `name`
-- y `tag` cambian (renombres, fusiones) y el emparejamiento por texto
-- envejece mal.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS riot_id  text;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS riot_img text;

CREATE UNIQUE INDEX IF NOT EXISTS teams_riot_id_key ON teams (riot_id)
  WHERE riot_id IS NOT NULL;
