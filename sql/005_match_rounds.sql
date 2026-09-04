-- Desglose ronda a ronda de cada mapa.
-- Correr en Supabase → SQL Editor. Es idempotente: se puede repetir sin romper nada.

-- ---------------------------------------------------------------
-- match_maps.rounds
-- ---------------------------------------------------------------
-- Va como jsonb en la misma fila del mapa (y no en una tabla aparte) porque
-- siempre se lee entero y a la vez que el marcador: la vista del partido pinta
-- la tira de rondas justo debajo del score de ese mapa. Ademas el scraper ya
-- borra y reinserta match_maps por partido, asi que una tabla hija solo
-- añadiria un DELETE mas y una FK que mantener.
--
-- Formato: array ordenado por ronda, una entrada por ronda jugada.
--
--   [{ "n": 5, "w": 1, "side": "ct", "how": "elim", "score": "2-3" }, ...]
--
--   n     numero de ronda tal cual lo publica vlr.gg (1..n, incluye prorroga)
--   w     1 = gano el equipo A (team_a), 2 = gano el equipo B (team_b)
--   side  lado del GANADOR esa ronda: "ct" | "t"
--   how   como acabo: "elim" | "defuse" | "boom" | "time" (null si no se supo)
--   score marcador acumulado tras la ronda, "A-B"
--
-- NULL significa "vlr.gg no publica el desglose de este mapa" (pasa en
-- partidos viejos y en parte de Challengers/GC), no "0 rondas". La vista se
-- apoya en esa diferencia para no pintar una tira vacia.
ALTER TABLE match_maps ADD COLUMN IF NOT EXISTS rounds jsonb;

COMMENT ON COLUMN match_maps.rounds IS
  'Desglose ronda a ronda: [{n,w,side,how,score}]. NULL = vlr.gg no lo publica.';
