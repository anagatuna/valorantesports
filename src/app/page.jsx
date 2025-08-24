// src/app/page.jsx
export const dynamic = "force-dynamic";

import { refreshIfStaleForLive } from "@/lib/refresh";
import { getUpcomingAndLiveCombined, getCompletedTodayOrPrev } from "@/lib/homeFeed";
import HomeMatches from "@/components/HomeMatches";

export default async function HomePage() {
  await refreshIfStaleForLive();

  const { items: combined, hasLive } = await getUpcomingAndLiveCombined();
  const completed = await getCompletedTodayOrPrev();

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <HomeMatches combined={combined} hasLiveInitial={hasLive} completed={completed} />
    </main>
  );
}
