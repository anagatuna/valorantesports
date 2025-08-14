import { BUCKETS } from '@/lib/regions';

async function fetchBySubregion(sub, status = 'all') {
  const url = `https://vlr.orlandomm.net/api/v1/events?page=1&status=${status}&region=${sub}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

async function fetchCNEvents(status = 'all') {
  const url = `https://vlr.orlandomm.net/api/v1/events?page=1&status=${status}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data || []).filter(e =>
    e.name.toLowerCase().includes('china') ||
    e.name.toLowerCase().includes('cn')
  );
}

export async function getEventsByBucket(bucket, { status = 'ongoing' } = {}) {
  if (bucket === 'CN') {
    return await fetchCNEvents(status);
  }
  const subs = BUCKETS[bucket] || [];
  const lists = await Promise.all(subs.map(s => fetchBySubregion(s, status)));
  return [...new Map(lists.flat().map(e => [e.id, e])).values()];
}