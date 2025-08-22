// src/app/page.jsx
//export const dynamic = 'force-dynamic';
//
//import { getUpcomingTodayAndNext, getCompletedTodayOrPrev } from '@/lib/homeFeed';
//import HomeMatches from '@/components/HomeMatches';
//
//export default async function HomePage() {
//  const { today, next } = await getUpcomingTodayAndNext();
//  const completed = await getCompletedTodayOrPrev();
//  return (
//    <main className="max-w-7xl mx-auto px-6 py-10">
//      <HomeMatches today={today} next={next} completed={completed} />
//    </main>
//  );
//}
//      <section>
//        <div className="flex items-end justify-between mb-4">
//          <h2 className="text-2xl font-bold">Completed matches</h2>
//          <span className="opacity-70 text-sm">{completed?.date}</span>
//        </div>
//        {Done.length ? (
//          <div className="grid md:grid-cols-3 gap-6">
//            {Done.map((match, i) => (
//              <MatchCard key={`c-${match.id}-${i}`} match={match} logos={logoMap} teamList={teamList} />
//            ))}
//          </div>
//        ) : (
//          <p className="opacity-70">No hay resultados disponibles.</p>
//        )}
//      </section>