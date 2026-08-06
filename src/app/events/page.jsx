export const dynamic = 'force-dynamic';

import { getEvents } from '@/lib/events';
import EventsBrowser from '@/components/EventsBrowser';

export default async function EventsPage() {
  const { events, source } = await getEvents();

  return (
    // pt-8: `main` en globals.css solo despeja la altura del navbar fijo
    // (--bar-h), sin dejar aire propio. Misma razon que en teams/layout.jsx.
    // El filtrado va en cliente: son ~70 eventos, no vale la pena un round-trip
    // al servidor por cada pulsacion de tab.
    <div className="pt-8">
      <EventsBrowser events={events} source={source} />
    </div>
  );
}
