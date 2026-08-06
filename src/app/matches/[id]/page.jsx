//src/app/matches/[id]/page.jsx
export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import BackLink from '@/components/BackLink';

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
        <BackLink href="/matches" label="Matches" />
        <h1 className="text-3xl font-extrabold mt-4">Partido no encontrado</h1>
        <p className="opacity-80 mt-2">Este partido no está en la base de datos o ya expiró.</p>
      </main>
    );
  }

  // 3. Los mapas no son una columna de `matches`: scrape_batch.mjs los guarda
  // en la tabla `match_maps`, una fila por mapa. Sin stats scrapeados (partido
  // futuro, o vlr.gg sin tabla) simplemente no hay filas y la sección queda vacía.
  const { data: maps } = await supabase
    .from('match_maps')
    .select('*')
    .eq('match_id', id)
    .order('id', { ascending: true });

  const mapRows = maps ?? [];

  // 4. Preparar datos para la vista
  const eventName = row.tournament || 'Valorant Match';
  
  const team1 = { name: row.team_a, score: row.score_a };
  const team2 = { name: row.team_b, score: row.score_b };

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <BackLink href="/matches" label="Matches" />
      <h1 className="text-3xl md:text-4xl font-extrabold mt-4">{eventName}</h1>

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
        {mapRows.length ? (
          <div className="divide-y divide-white/10">
            {mapRows.map((m) => (
              <div key={m.id} className="py-2 flex justify-between">
                <span>{m.map_name || 'Map'}</span>
                <span className="font-semibold">
                  {m.score_a ?? '-'} : {m.score_b ?? '-'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="opacity-70">Los mapas no están disponibles para este partido.</p>
        )}
      </section>
    </main>
  );
}
