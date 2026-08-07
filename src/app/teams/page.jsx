export const dynamic = 'force-dynamic';

import { getTeamsGrouped, getInitials } from '@/lib/teams';
import RegionTabs from '@/components/RegionTabs'; // <-- 1. Importamos las pestañas
import TeamCard from '@/components/TeamCard';
import { REGION_LOGOS } from '@/lib/regionLogos';

export default async function TeamsPage({ searchParams }) {
  // Leemos el parámetro de la URL (ej: ?region=AMERICAS). 
  // En Next.js 15+ searchParams es una promesa, por eso usamos await.
  const params = await searchParams;
  const regionFilter = params?.region || 'ALL';

  const { groups } = await getTeamsGrouped();

  // Filtramos los grupos: si es 'ALL' mostramos todos, sino solo el que coincide
  const displayGroups = regionFilter === 'ALL'
    ? groups
    : groups.filter(g => g.label === regionFilter);

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      
      {/* 2. Colocamos las pestañas y le pasamos el filtro de la URL para que brille la correcta */}
      <RegionTabs activeRegion={regionFilter} />

      {displayGroups.length === 0 ? (
        <p className="text-white/50 text-sm text-center py-10">
          No hay equipos para esta región todavía.
        </p>
      ) : (
        <div className="flex flex-col gap-10 mt-4">
          {displayGroups.map((group) => (
            <section key={group.label}>

              {/* Si estamos en "ALL", mostramos el nombre de cada región para separar */}
              {regionFilter === 'ALL' && (
                <header className="mb-4 flex items-center gap-4">
                  {/* El logo ya trae el lockup "VCT <REGIÓN>", así que hace de
                      titular. Va con alto fijo y ancho automático: son piezas
                      apaisadas (~3.5:1) y encajarlas en un cuadrado las
                      encogía hasta que no se leía la palabra. */}
                  <h2 className="shrink-0 leading-none">
                    {REGION_LOGOS[group.label] ? (
                      <img
                        src={REGION_LOGOS[group.label]}
                        alt={`VCT ${group.label}`}
                        className="h-10 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)]"
                      />
                    ) : (
                      <span className="font-[family-name:var(--font-mark)] text-xl font-bold uppercase tracking-[0.18em]">
                        VCT <span className="text-[#ff4655]">{group.label}</span>
                      </span>
                    )}
                  </h2>
                  {/* Filete que muere hacia la derecha, como los separadores del cliente */}
                  <span className="h-px flex-1 bg-gradient-to-r from-white/25 to-transparent" aria-hidden="true" />
                  <span className="font-[family-name:var(--font-mark)] text-[10px] tracking-[0.24em] text-white/40 uppercase">
                    {group.teams.length} Teams
                  </span>
                </header>
              )}

              {/* Cuadrícula de tarjetas de equipos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {group.teams.map((team) => (
                  <TeamCard key={team.slug} team={team} initials={getInitials(team.name)} />
                ))}
              </div>

            </section>
          ))}
        </div>
      )}
    </div>
  );
}