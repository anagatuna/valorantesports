export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getTeamsGrouped, BUCKET_LABELS } from '@/lib/teams';

export default async function Teams() {
  const cookieStore = await cookies();
  const cookieRegion = cookieStore.get('region')?.value;
  const region = BUCKET_LABELS.includes(cookieRegion) ? cookieRegion : 'AMERICAS';

  const { groups } = await getTeamsGrouped();

  // Igual que en el juego: se entra directo al detalle de un equipo.
  // Se prioriza la región del usuario y se cae a la primera con datos.
  const preferred = groups.find(g => g.label === region && g.teams.length > 0);
  const target = preferred || groups.find(g => g.teams.length > 0);

  if (target) redirect(`/teams/${target.teams[0].slug}`);

  return (
    <p className='text-white/50 text-sm'>
      No hay equipos con región asignada todavía.
    </p>
  );
}
