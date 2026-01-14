// Opcional: fuerza render dinámico para evitar cachés
export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import Link from 'next/link';
import { getEventsByBucket } from '@/lib/events';
import RegionSwitcher from '@/components/RegionSwitcher';
import { REGION_LOGOS } from '@/lib/regionLogos';

const BUCKET_LABELS = ['AMERICAS', 'EMEA', 'PACIFIC', 'CN'];

// ✅ FUNCIÓN HELPER: Convierte URLs externas a URLs del Proxy
const getProxyUrl = (url) => {
  if (!url) return '';
  // Si ya es una ruta local (empieza con /), la dejamos igual
  if (url.startsWith('/')) return url;
  // Si es externa, la pasamos por el proxy
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
};

function BucketCard({ regionKey, title, ev }) {
  return (
    <div className="rounded-2xl p-6 border border-white/10 bg-gradient-to-b from-[#611419] to-[#3a0b10]">
      <div className="flex items-center gap-3 mb-2">
        {REGION_LOGOS[regionKey] && (
          <img
            src={REGION_LOGOS[regionKey]}
            alt={`${regionKey} logo`}
            className="w-6 h-6"
          />
        )}
        <p className="text-xs uppercase opacity-80 tracking-widest">{title}</p>
      </div>

      <h3 className="text-xl font-bold">{ev?.name || 'Sin evento activo'}</h3>
      <p className="opacity-80">{ev?.dates || '—'}</p>

      {ev?.img && (
        <img
          // ✅ AQUI APLICAMOS EL PROXY
          src={getProxyUrl(ev.img)}
          alt={ev.name}
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

export default async function Teams() {
  // ✅ cookies() es async
  const cookieStore = await cookies();
  const cookieRegion = cookieStore.get('region')?.value;
  const region = BUCKET_LABELS.includes(cookieRegion) ? cookieRegion : 'AMERICAS';

  // Trae eventos de la región (ongoing → upcoming)
  let events = await getEventsByBucket(region, { status: 'ongoing' });
  if (!events.length) events = await getEventsByBucket(region, { status: 'upcoming' });
  const mainEvent = events[0] || null;

  // Trae un “principal” para las otras regiones
  const otherRegions = BUCKET_LABELS.filter(b => b !== region);
  const [r1, r2, r3] = await Promise.all(
    otherRegions.map(b =>
      getEventsByBucket(b, { status: 'ongoing' }).then(list => list[0] || null)
    )
  );

  // 🔁 AHORA SÍ devolvemos JSX
  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      {/* Hero: torneo principal + logo + switcher */}
      <section className="rounded-2xl p-8 border border-white/10 bg-gradient-to-b from-[#611419] to-[#3a0b10] shadow-xl mb-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {REGION_LOGOS[region] && (
              <img
                src={REGION_LOGOS[region]}
                alt={`${region} logo`}
                className="w-10 h-10"
              />
            )}
            <div>
              <p className="text-sm uppercase tracking-widest opacity-80">
                Tu región: {region}
              </p>
              <h1 className="text-3xl md:text-4xl font-extrabold mt-1">
                {mainEvent?.name || `VALORANT CHAMPIONS TOUR: ${region}`}
              </h1>
              <p className="mt-2 opacity-80">{mainEvent?.dates || 'Próximamente'}</p>
            </div>
          </div>

          <RegionSwitcher region={region} />
        </div>

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
      </section>

      {/* Otras regiones */}
      <section className="grid md:grid-cols-3 gap-6">
        <BucketCard regionKey={otherRegions[0]} title={otherRegions[0]} ev={r1} />
        <BucketCard regionKey={otherRegions[1]} title={otherRegions[1]} ev={r2} />
        <BucketCard regionKey={otherRegions[2]} title={otherRegions[2]} ev={r3} />
      </section>
    </main>
  );
}