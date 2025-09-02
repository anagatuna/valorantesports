// src/app/page.jsx
export const dynamic = 'force-dynamic';

import { getUpcomingTodayAndNextFromVlrgg, getCompletedTodayOrPrevFromVlrgg } from "@/lib/vlrggFeed";
import HomeMatches from "@/components/HomeMatches";

export default async function HomePage() {
  const { today, next } = await getUpcomingTodayAndNextFromVlrgg();
  const completed = await getCompletedTodayOrPrevFromVlrgg(); // si no hay endpoint, devolverá []

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <HomeMatches today={today} next={next} completed={completed} />
    </main>
  );
}
