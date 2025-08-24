// src/lib/homeFeed.js

const BASE =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000"
    : ""; // en cliente, usa ruta relativa

async function getJSON(path) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { data: [] };
  return res.json();
}

/** LIVE + UPCOMING juntos, ordenados por hora asc (lo hace el API) y limit 10 */
export async function getUpcomingAndLiveCombined() {
  // tomamos un poco más y luego recortamos
  const [live, upc] = await Promise.all([
    getJSON("/api/matches?status=LIVE&limit=50"),
    getJSON("/api/matches?status=UPCOMING&limit=200"),
  ]);

  const all = [...(live?.data || []), ...(upc?.data || [])];

  // El API ya devuelve ordenado por startTs asc; solo dedupe y recorta
  const seen = new Set();
  const items = [];
  for (const m of all) {
    if (m?.id && !seen.has(m.id)) {
      seen.add(m.id);
      items.push(m);
    }
    if (items.length >= 10) break;
  }

  return { items, hasLive: (live?.data || []).length > 0 };
}

/** COMPLETED: ya viene ordenado desc desde el API */
export async function getCompletedTodayOrPrev() {
  const comp = await getJSON("/api/matches?status=COMPLETED&limit=10");
  return { items: comp?.data || [] };
}
