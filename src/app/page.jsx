// app/matches/page.jsx

import { cookies } from 'next/headers';
import Link from 'next/link';
import { getEventsByBucket } from '@/lib/events';

const BUCKET_LABELS = ['AMERICAS', 'EMEA', 'PACIFIC', 'CN'];

function BucketCard({ title, ev }) {
  return (
    <div className="rounded-2xl p-6 border border-white/10 bg-gradient-to-b from-[#611419] to-[#3a0b10]">
      <p className="text-xs uppercase opacity-80 tracking-widest">{title}</p>
      <h3 className="text-xl font-bold mt-1">{ev?.name || 'Sin evento activo'}</h3>
      <p className="opacity-80">{ev?.dates || '—'}</p>
      {ev?.img && (
        <img
          src="/vct-americas.svg"
          alt="VCT Americas"
          className="mt-3 rounded-lg border border-white/10 w-full h-auto"
        />
      )}
      {ev?.id && (
        <Link
          href={`/tournaments/${ev.id}`}
          className="inline-block mt-4 px-4 py-2 rounded border border-white/15 hover:border-white/30"
        >
          Ver torneo
        </Link>
      )}
    </div>
  );
}

export default async function HomePage() {
  // 1) Lee la cookie 'region' o usa AMERICAS
  const cookieRegion = cookies().get('region')?.value;
  const region = BUCKET_LABELS.includes(cookieRegion) ? cookieRegion : 'AMERICAS';

  // 2) Intenta eventos "ongoing"; si vacío, cae a "upcoming"
  let events = await getEventsByBucket(region, { status: 'ongoing' });
  if (!events.length) events = await getEventsByBucket(region, { status: 'upcoming' });

  const mainEvent = events[0] || null;

  // 3) Para las tarjetas secundarias (mostrar las otras regiones)
  const otherRegions = BUCKET_LABELS.filter(b => b !== region);
  const [r1, r2, r3] = await Promise.all(
    otherRegions.map(b => getEventsByBucket(b, { status: 'ongoing' }).then(list => list[0] || null))
  );

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      {/* Hero: torneo principal de la región detectada */}
      <section className="valorant-bg text-white min-h-screen flex items-center justify-center">
        <p className="text-sm uppercase tracking-widest opacity-80">
          Tu región: {region}
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold mt-1">
          {mainEvent?.name || `VALORANT CHAMPIONS TOUR: ${region}`}
        </h1>
        <p className="mt-2 opacity-80">{mainEvent?.dates || 'Próximamente'}</p>

        <div className="mt-6 flex gap-3">
          <Link
            href={mainEvent ? `/tournaments/${mainEvent.id}` : `/tournaments`}
            className="px-5 py-3 rounded-xl border border-white/15 hover:border-white/30 transition"
          >
            Ver torneo
          </Link>
          <Link
            href={mainEvent ? `/tournaments/${mainEvent.id}/schedule` : `/tournaments/schedule`}
            className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 transition"
          >
            Ver calendario
          </Link>
        </div>

        {/* Selector manual para cambiar región */}
        <form action="/api/set-region" method="POST" className="mt-6">
          <label className="text-sm opacity-80 mr-2">Cambiar región:</label>
          <select name="region" defaultValue={region} className="bg-black/30 border border-white/10 rounded px-3 py-2">
            {BUCKET_LABELS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="ml-3 px-4 py-2 rounded border border-white/15 hover:border-white/30" type="submit">
            Aplicar
          </button>
        </form>
      </section>

      {/* Cards de las otras regiones */}
      <section className="grid md:grid-cols-3 gap-6">
        <BucketCard title={otherRegions[0]} ev={r1} />
        <BucketCard title={otherRegions[1]} ev={r2} />
        <BucketCard title={otherRegions[2]} ev={r3} />
      </section>
    </main>
  );
}
