export const dynamic = 'force-dynamic';

import { getTeamsGrouped, getInitials } from '@/lib/teams';
import RegionTabs from '@/components/RegionTabs'; // <-- 1. Importamos las pestañas
import TeamCard from '@/components/TeamCard';

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
        <div className="flex flex-col gap-12 mt-4">
          {displayGroups.map((group) => (
            <section key={group.label}>
              
              {/* Si estamos en "ALL", mostramos el nombre de cada región para separar */}
              {regionFilter === 'ALL' && (
                <h2 className="text-[#ff4655] font-black text-2xl uppercase tracking-widest mb-6 border-b border-white/10 pb-2">
                  VCT {group.label}
                </h2>
              )}

              {/* Cuadrícula de tarjetas de equipos */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
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