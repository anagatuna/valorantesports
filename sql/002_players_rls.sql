-- Arreglo: `players` quedó con RLS activo y sólo política de SELECT, así que
-- el scraper (que corre con la clave anon) no puede escribir.
--
-- Elegí UNA de las dos opciones.


-- ===============================================================
-- OPCIÓN A — Rápida: apagar RLS (queda igual que tu tabla `teams`)
-- ===============================================================
-- Contrapartida: la anon key va pública en el bundle del navegador, así que
-- cualquiera podría escribir en la tabla. Tu `teams` ya está así hoy.

ALTER TABLE players DISABLE ROW LEVEL SECURITY;


-- ===============================================================
-- OPCIÓN B — Correcta: dejar RLS y que el scraper use service_role
-- ===============================================================
-- El público sólo lee; el scraper escribe porque service_role ignora RLS.
--
-- Pasos:
--   1. Supabase → Settings → API → copiar la clave `service_role`.
--   2. Agregarla a .env.local:        SUPABASE_KEY=eyJ...
--   3. Agregarla a los secrets del repo como SUPABASE_KEY.
--      (El workflow ya la lee con ese nombre.)
--   4. Correr el bloque de abajo en vez de la Opción A.
--
-- NO pongas la service_role key en NEXT_PUBLIC_*: eso la expondría al browser.
--
-- ALTER TABLE players ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "players lectura publica" ON players;
-- CREATE POLICY "players lectura publica"
--   ON players FOR SELECT
--   USING (true);
