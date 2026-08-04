export const dynamic = 'force-dynamic';

import { getTeamsGrouped } from '@/lib/teams';
import TeamsSidebar from '@/components/TeamsSidebar';

export default async function TeamsLayout({ children }) {
  const { groups, onlyPartners } = await getTeamsGrouped();

  return (
    // pt-8: `main` en globals.css sólo despeja la altura del navbar fijo
    // (--bar-h), sin dejar aire propio.
    <div className='grid gap-6 pt-8 md:grid-cols-[240px_minmax(0,1fr)] items-start'>
      {/* El <aside> reserva la columna; el panel se fija por dentro.
          No se usa `sticky` porque globals.css pone overflow-x:hidden en
          html/body y eso lo anula. */}
      <aside className='md:h-[calc(100dvh-var(--bar-h)-3.5rem)]'>
        <TeamsSidebar groups={groups} onlyPartners={onlyPartners} />
      </aside>
      <div className='min-w-0'>{children}</div>
    </div>
  );
}
