'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { REGION_LOGOS } from '@/lib/regionLogos';

export default function TeamsSidebar({ groups, onlyPartners = false }) {
  const pathname = usePathname();
  const activeSlug = pathname.startsWith('/teams/') ? pathname.slice('/teams/'.length) : null;

  // En desktop el panel queda fijo con scroll propio, como la lista del juego.
  const panelClases =
    'rounded-xl border border-white/10 bg-black/30 overflow-hidden ' +
    'md:fixed md:w-[240px] md:top-[calc(var(--bar-h)+2rem)] md:bottom-6 md:flex md:flex-col';

  return (
    <nav className={panelClases}>
      <div className='flex items-center gap-3 px-4 py-4 border-b border-white/10 shrink-0'>
        <img src='/logo.png' alt='' className='w-6 h-6 object-contain' aria-hidden='true' />
        <div>
          <p className='text-lg font-extrabold leading-none tracking-wide text-[#ff4655]'>
            VCT 2026
          </p>
          <p className='text-[10px] uppercase tracking-[0.2em] text-white/50 mt-1'>
            {onlyPartners ? 'Partnered Teams' : 'Equipos'}
          </p>
        </div>
      </div>

      <div className='md:flex-1 md:overflow-y-auto'>
      {groups.map(({ label, teams }) => {
        const hasActive = teams.some(t => t.slug === activeSlug);
        return (
          <details key={label} open={hasActive} className='group border-b border-white/5'>
            <summary className='flex items-center gap-2 px-4 py-3 cursor-pointer select-none hover:bg-white/5 transition list-none'>
              {REGION_LOGOS[label] && (
                <img src={REGION_LOGOS[label]} alt='' className='w-4 h-4' aria-hidden='true' />
              )}
              <span className='text-xs font-bold uppercase tracking-widest flex-1'>
                VCT {label}
              </span>
              <span className='text-[10px] text-white/40'>{teams.length}</span>
              <span className='text-white/40 text-[10px] transition-transform group-open:rotate-90'>
                &#9656;
              </span>
            </summary>

            <ul className='pb-2'>
              {teams.map(team => {
                const isActive = team.slug === activeSlug;
                return (
                  <li key={team.slug}>
                    <Link
                      href={`/teams/${team.slug}`}
                      aria-current={isActive ? 'page' : undefined}
                      className={
                        'block pl-6 pr-4 py-2 text-sm border-l-2 transition truncate ' +
                        (isActive
                          ? 'border-[#ff4655] bg-white/5 text-white font-semibold'
                          : 'border-transparent text-white/60 hover:text-white hover:bg-white/5')
                      }
                    >
                      {team.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
      </div>
    </nav>
  );
}
