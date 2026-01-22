//src/app/matches/page.jsx
export const dynamic = 'force-dynamic';

import { getUpcomingTodayAndNextFromVlrgg, getCompletedTodayOrPrevFromVlrgg } from "@/lib/vlrggFeed";
import HomeMatches from "@/components/HomeMatches";

/* normalizador que respeta event si ya viene */
function resolveEvent(raw = {}) {
  return (
    (raw.event && String(raw.event).trim()) ||      // ← quedará del results endpoint
    (raw.tournament && String(raw.tournament).trim()) ||
    (raw.league?.name && String(raw.league.name).trim()) ||
    (raw.stage?.event && String(raw.stage.event).trim()) ||
    (raw.series?.event && String(raw.series.event).trim()) ||
    (raw.stage?.name && String(raw.stage.name).trim()) ||
    ""
  );
}
const normalizeMatch = (raw = {}) => ({ ...raw, event: resolveEvent(raw) });
const normalizeCollection = (coll) => ({ items: (coll?.items || []).map(normalizeMatch) });

export default async function HomePage() {
  const { today, next } = await getUpcomingTodayAndNextFromVlrgg();

  const normToday = normalizeCollection(today);
  const normNext = normalizeCollection(next);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <HomeMatches today={normToday} next={normNext} />
    </main>
  );
}
