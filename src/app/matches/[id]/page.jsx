export const dynamic = 'force-dynamic';

import Link from "next/link";
import { getMatchDetails, getMatchLiteFromLists } from "@/lib/matchDetails";

export default async function MatchDetailPage({ params }) {
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  if (!id) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold">Match no especificado</h1>
      </main>
    );
  }

  // intenta endpoint de detalle; si no existe, busca en listas
  const detail = await getMatchDetails(id);
  const data = detail ?? await getMatchLiteFromLists(id);

  if (!data) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/matches" className="text-sm opacity-70 hover:opacity-100">← Volver</Link>
        <h1 className="text-3xl font-extrabold mt-2">Partido {id}</h1>
        <p className="opacity-80 mt-2">No encontré información para este partido.</p>
      </main>
    );
  }

  const event = data.event || data.tournament || data.name || 'Match';
  const teams = data.teams || [
    { name: data.team1?.name, score: data.team1?.score ?? data.score1 },
    { name: data.team2?.name, score: data.team2?.score ?? data.score2 },
  ];
  const maps = Array.isArray(data.maps) ? data.maps : [];

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <Link href="/matches" className="text-sm opacity-70 hover:opacity-100">← Volver</Link>
      <h1 className="text-3xl md:text-4xl font-extrabold mt-2">{event}</h1>

      {/* Overview */}
      <section className="mt-6 grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="font-semibold">{teams?.[0]?.name || '—'}</div>
          <div className="text-2xl">{teams?.[0]?.score ?? '-'}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="font-semibold">{teams?.[1]?.name || '—'}</div>
          <div className="text-2xl">{teams?.[1]?.score ?? '-'}</div>
        </div>
      </section>

      {/* Maps */}
      <section className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-xl font-bold mb-3">Maps</h2>
        {maps.length ? (
          <div className="divide-y divide-white/10">
            {maps.map((m, i) => (
              <div key={i} className="py-2 flex justify-between">
                <span>{m.name || m.map || 'Map'}</span>
                <span className="font-semibold">
                  {(m.t1?.score ?? m.score1 ?? '-')} : {(m.t2?.score ?? m.score2 ?? '-')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="opacity-70">Los mapas no están disponibles en la API actual.</p>
        )}
      </section>
    </main>
  );
}
