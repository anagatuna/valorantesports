export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getTeamsGrouped, getInitials } from '@/lib/teams';
import RegionTabs from '@/components/RegionTabs'; // <-- 1. Importamos las pestañas

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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {group.teams.map((team) => (
                  <Link
                    key={team.slug}
                    href={`/teams/${team.slug}`}
                    className="group relative bg-[#0a0a0c] border border-white/10 hover:border-[#ff4655] p-6 flex flex-col items-center justify-center gap-4 transition-all duration-300 ease-out hover:-translate-y-2 hover:shadow-[0_10px_20px_-10px_rgba(255,70,85,0.4)]"
                  >
                    {/* Contenedor del Logo */}
                    {team.logo ? (
                      <img
                        src={team.logo}
                        alt={team.name}
                        className="w-24 h-24 object-contain transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center text-3xl font-black text-white/20 transition-transform duration-300 group-hover:scale-110">
                        {getInitials(team.name)}
                      </div>
                    )}
                    
                    {/* Nombre del equipo */}
                    <span className="font-bold uppercase text-sm tracking-[0.1em] text-white/70 group-hover:text-white text-center transition-colors">
                      {team.name}
                    </span>
                  </Link>
                ))}
              </div>

            </section>
          ))}
        </div>
      )}
    </div>
  );
}