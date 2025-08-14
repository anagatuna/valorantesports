// Detecta TIER por nombre del torneo
export function classifyTier(tournamentName = '') {
  const n = tournamentName.toLowerCase();
  if (n.includes('game changers') || n.includes('gc')) return 'GC';     // Game Changers
  if (n.includes('champions') || n.includes('masters') || n.includes('stage')) return 'T1'; // VCT Tier 1
  if (n.includes('challenger') || n.includes('ascension')) return 'T2'; // Tier 2
  return 'T2';
}
export function tierWeight(tier) {
  return tier === 'T1' ? 0 : tier === 'T2' ? 1 : 2; // T1 primero
}

// Etiqueta visual
export function tierLabel(name) {
  const t = classifyTier(name);
  return t; // 'T1' | 'T2' | 'GC'
}

// Heurística útil para badge (no filtra nada, solo etiqueta)
export function guessRegionFromName(name = '') {
  const n = name.toLowerCase();
  if (n.includes('china')) return 'CN';
  if (n.includes('americas') || n.includes('na') || n.includes('latam')) return 'AMERICAS';
  if (n.includes('emea') || n.includes('europe') || n.includes('mena')) return 'EMEA';
  if (n.includes('pacific') || n.includes('apac') || n.includes('korea') || n.includes('japan')) return 'PACIFIC';
  return null;
}
