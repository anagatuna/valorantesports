//src/app/matches/[id]/page.jsx
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { createClient } from '@supabase/supabase-js';

// --- Configuración Supabase ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function MatchDetailPage({ params }) {
  // En Next.js 15, params es una promesa
  const resolvedParams = await params; 
  const id = resolvedParams?.id;

  if (!id) return <div>ID requerido</div>;

  // 1. Buscar en Supabase por ID
  const { data: row } = await supabase
    .from('matches')
    .select('*')
    .eq('id', id)
    .single();

  // 2. Manejo de "No encontrado"
  if (!row) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/matches" className="text-sm opacity-70 hover:opacity-100">← Volver</Link>
        <h1 className="text-3xl font-extrabold mt-2">Partido no encontrado</h1>
        <p className="opacity-80 mt-2">Este partido no está en la base de datos o ya expiró.</p>
      </main>
    );
  }

  // 3. Preparar datos para la vista
  // Nota: Si tu scraper no guarda "maps" en la DB, esa sección quedará vacía.
  const eventName = row.tournament || 'Valorant Match';
  
  const team1 = { name: row.team_a, score: row.score_a };
  const team2 = { name: row.team_b, score: row.score_b };

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <Link href="/matches" className="text-sm opacity-70 hover:opacity-100">← Volver</Link>
      <h1 className="text-3xl md:text-4xl font-extrabold mt-2">{eventName}</h1>

      {/* Marcador Principal */}
      <section className="mt-6 grid sm:grid-cols-2 gap-4">
        {/* Equipo A */}
        <div className={`rounded-xl border p-4 ${row.score_a > row.score_b ? 'bg-green-900/20 border-green-500/50' : 'bg-white/5 border-white/10'}`}>
          <div className="font-semibold text-lg">{team1.name || 'TBA'}</div>
          <div className="text-3xl font-bold mt-1">{team1.score ?? '-'}</div>
        </div>

        {/* Equipo B */}
        <div className={`rounded-xl border p-4 ${row.score_b > row.score_a ? 'bg-green-900/20 border-green-500/50' : 'bg-white/5 border-white/10'}`}>
          <div className="font-semibold text-lg">{team2.name || 'TBA'}</div>
          <div className="text-3xl font-bold mt-1">{team2.score ?? '-'}</div>
        </div>
      </section>

      {/* Estado */}
      <div className="mt-4">
        <span className={`px-3 py-1 rounded text-sm font-bold ${
            row.status === 'LIVE' ? 'bg-red-500 text-white' : 
            row.status === 'COMPLETED' ? 'bg-gray-600 text-gray-200' : 'bg-blue-600 text-white'
        }`}>
            {row.status}
        </span>
        <span className="ml-3 text-sm opacity-60">
            ID: {row.id}
        </span>
      </div>

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
