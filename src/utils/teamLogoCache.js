const CACHE_KEY = "teamLogos";
const EXPIRATION_HOURS = 24;

export function saveLogosToCache(logoMap, teamList) {
  const payload = {
    logoMap,
    teamList,
    timestamp: Date.now(),
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

export function loadLogosFromCache() {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;

  try {
    const { logoMap, teamList, timestamp } = JSON.parse(raw);
    const expired = Date.now() - timestamp > EXPIRATION_HOURS * 60 * 60 * 1000;

    if (expired || !logoMap || !teamList) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return { logoMap, teamList };
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}
