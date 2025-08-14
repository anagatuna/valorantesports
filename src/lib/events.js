import { BUCKETS } from '@/lib/regions';

const API = 'https://vlr.orlandomm.net/api/v1/events';

async function fetchBySubregion(sub, status = 'all') {
  const url = `${API}?page=1&status=${status}&region=${sub}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

function dedupeById(items) {
  const map = new Map();
  for (const e of items) if (e?.id) map.set(e.id, e);
  return [...map.values()];
}

export async function getEventsByBucket(bucket, { status = 'ongoing' } = {}) {
  const subs = BUCKETS[bucket] || [];
  const lists = await Promise.all(subs.map(s => fetchBySubregion(s, status)));
  return dedupeById(lists.flat());
}
