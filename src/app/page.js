'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    fetch('https://vlr.orlandomm.net/api/v1/matches')
      .then((res) => res.json())
      .then((data) => {
        console.log('Respuesta de la API:', data);
        setMatches(data.data);
      })
      .catch((error) => console.error('Error al obtener los datos:', error));
  }, []);

  if (!matches.length) {
    return (
      <main className="p-6 bg-gray-900 text-white min-h-screen">
        <h1 className="text-3xl font-bold mb-6">Partidos Recientes</h1>
        <p>No hay partidos disponibles actualmente.</p>
      </main>
    );
  }

  return (
    <main className="p-6 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Partidos Recientes</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {matches.map((match, index) => (
          <div key={index} className="bg-gray-800 p-4 rounded-lg shadow hover:shadow-lg transition">
            {match.img && (
              <img
                src={match.img}
                alt="Imagen del partido"
                className="w-full h-auto object-cover mb-4 rounded" //aqui hay que cambiar el tamaño de los logos de los torneos.//
              />
            )}
            <p className="text-lg font-semibold mb-1">
              {match.teams?.[0]?.name ?? 'Equipo 1'} vs {match.teams?.[1]?.name ?? 'Equipo 2'}
            </p>
            <p className="text-sm text-gray-300 mb-1">{match.status ?? 'Estado desconocido'}</p>
            <p className="text-sm text-gray-400">{match.event ?? 'Evento desconocido'}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
