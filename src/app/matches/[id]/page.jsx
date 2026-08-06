//src/app/matches/[id]/page.jsx
export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import BackLink from '@/components/BackLink';
import MatchBreakdown from '@/components/MatchBreakdown';

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
      <main className="max-w-6xl mx-auto px-6 py-10">
        <BackLink href="/matches" label="Matches" />
        <h1 className="text-3xl font-extrabold mt-4">Partido no encontrado</h1>
        <p className="opacity-80 mt-2">Este partido no está en la base de datos o ya expiró.</p>
      </main>
    );
  }

  // 3. El desglose vive en dos tablas aparte, no en columnas de `matches`:
  // match_maps trae una fila por mapa (marcador y rondas CT/T) y match_stats
  // una fila por jugador y mapa. Sin scrapear (partido futuro, o vlr.gg sin
  // tabla de stats) simplemente no hay filas y la vista lo dice.
  const [mapsRes, statsRes] = await Promise.all([
    supabase.from('match_maps').select('*').eq('match_id', id).order('id', { ascending: true }),
    supabase.from('match_stats').select('*').eq('match_id', id),
  ]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <BackLink href="/matches" label="Matches" />

      <div className="mt-6">
        <MatchBreakdown
          match={row}
          maps={mapsRes.data ?? []}
          stats={statsRes.data ?? []}
        />
      </div>
    </main>
  );
}
