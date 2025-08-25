// src/app/page.jsx
export const dynamic = 'force-dynamic';

import { getUpcomingTodayAndNext, getCompletedTodayOrPrev } from '@/lib/homeFeed';
import HomeMatches from '@/components/HomeMatches';

export default async function HomePage() {
  const { today, next } = await getUpcomingTodayAndNext();
  const completed = await getCompletedTodayOrPrev();
  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <HomeMatches today={today} next={next} completed={completed} />
    </main>
  );
}
