const BASE = 'https://vlr.orlandomm.net/api/v1';

async function safeJson(res) { try { return await res.json(); } catch { return null; } }
async function fetchJSON(url) {
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) return null;
  return await safeJson(res);
}

/**
 * Intenta varias rutas comunes para detalle.
 * Devuelve null si el backend no expone detalles.
 */
export async function getMatchDetails(id) {
  const candidates = [
    `${BASE}/matches/${id}`,
    `${BASE}/match/${id}`,
    `${BASE}/matches/${id}/details`,
    `${BASE}/match/${id}/details`,
  ];
  for (const url of candidates) {
    const json = await fetchJSON(url);
    const data = Array.isArray(json?.data) ? json.data[0] : (json?.data || json);
    if (data && (data.id || data.event || data.maps || data.teams)) {
      return data;
    }
  }
  return null;
}

/**
 * Como fallback, busca el match en listas públicas por si al menos
 * podemos mostrar un overview (sin maps/players profundos).
 */
export async function getMatchLiteFromLists(id) {
  const listEndpoints = [
    `${BASE}/matches?page=1`,
    `${BASE}/matches?page=2`,
    `${BASE}/results?page=1`,
    `${BASE}/results?page=2`,
  ];
  for (const url of listEndpoints) {
    const json = await fetchJSON(url);
    const arr = Array.isArray(json?.data) ? json.data : [];
    const hit = arr.find((m) => String(m.id) === String(id));
    if (hit) return hit;
  }
  return null;
}
