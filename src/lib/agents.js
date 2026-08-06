/**
 * Helpers de agentes, compartidos por MatchDetail (la card expandida del home)
 * y MatchBreakdown (la pagina de partido). Estaban duplicados en el primero.
 */

// Carpetas realmente presentes en public/agents. Si el agente no está aquí
// (agent_img vacío o un nombre que no reconocemos) no pedimos la imagen:
// antes se generaba /agents/unknown/unknown-1.webp y devolvía 404.
export const KNOWN_AGENTS = new Set([
  "astra", "breach", "brimstone", "chamber", "clove", "cypher", "deadlock",
  "fade", "gekko", "harbor", "iso", "jett", "kayo", "killjoy", "neon", "omen",
  "phoenix", "raze", "reyna", "sage", "skye", "sova", "tejo", "veto", "viper",
  "vyse", "waylay", "yoru",
]);

const AGENT_ALIAS = { "kay/o": "kayo", brim: "brimstone", harbour: "harbor" };

export const agentKey = (s = "") => {
  if (!s) return "unknown";
  let cleanName = s;
  if (s.includes('/')) {
    const parts = s.split('/');
    cleanName = parts[parts.length - 1].split('.')[0].replace(/\d/g, '');
  }
  // Marcas diacriticas combinantes, escapadas a proposito (ver src/lib/maps.js).
  const base = cleanName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const key = base.replace(/[^a-z]/g, "");
  return (AGENT_ALIAS[key] || key).replace("/", "");
};

export function resolveAgentPair(agentNameOrUrl) {
  const k = agentKey(agentNameOrUrl);
  if (!KNOWN_AGENTS.has(k)) return null;
  // -1: icono de cara (default). -2: agente de cuerpo entero (se ve en hover).
  return { cover: `/agents/${k}/${k}-1.webp`, standing: `/agents/${k}/${k}-2.webp` };
}

// Un jugador puede tener 2 agentes en la vista "All Maps" (uno por mapa jugado).
// El scraper los guarda separados por "||" en la misma columna agent_img.
export const splitAgents = (raw = "") =>
  String(raw).split('||').map(s => s.trim()).filter(Boolean);

/**
 * Reparte las filas de match_stats de un mapa en los dos equipos, respetando
 * el orden en que vienen los equipos del partido. El scraper guarda team_name
 * con el nombre de vlr.gg, que no siempre coincide literal con el de la fila
 * de `matches`, asi que caemos a "el primero que aparezca" si no hay match.
 */
export function splitByTeam(rows, name1, name2) {
  const teamsInDb = [...new Set(rows.map(r => r.team_name))];
  const teamA = teamsInDb.find(n => name1 && n?.includes(name1)) || teamsInDb[0];
  const teamB = teamsInDb.find(n => n !== teamA)
    || teamsInDb.find(n => name2 && n?.includes(name2));
  return {
    teamA,
    teamB,
    rowsA: rows.filter(r => r.team_name === teamA),
    rowsB: rows.filter(r => r.team_name === teamB),
  };
}
