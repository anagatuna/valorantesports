/**
 * Fuente unica de los fondos de mapa. Antes esto estaba duplicado en
 * HomeMatches y MatchDetail, con el riesgo de agregar un mapa en uno y no
 * en el otro.
 *
 * Cada clave debe tener su archivo en public/maps/<clave>.webp. Si el archivo
 * falta, <MapBackground> lo detecta al cargar y no pinta nada: nunca se queda
 * una imagen rota.
 */
export const MAP_IMAGES = {
  abyss: "/maps/abyss.webp",
  ascent: "/maps/ascent.webp",
  bind: "/maps/bind.webp",
  breeze: "/maps/breeze.webp",
  corrode: "/maps/corrode.webp",
  fracture: "/maps/fracture.webp",
  haven: "/maps/haven.webp",
  icebox: "/maps/icebox.webp",
  lotus: "/maps/lotus.webp",
  pearl: "/maps/pearl.webp",
  split: "/maps/split.webp",
  summit: "/maps/summit.webp",
  sunset: "/maps/sunset.webp",
};

// Marcas diacriticas combinantes. Escapadas a proposito: en MatchDetail
// estaban con los caracteres literales y son invisibles en el editor.
const COMBINING_MARKS = /[\u0300-\u036f]/g;

export const normMap = (s = "") =>
  s.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "").replace(/[^a-z0-9]/g, "");

/**
 * null cuando no conocemos el mapa. Antes caia a MAP_IMAGES.unknown, que
 * apuntaba a un /maps/unknown.webp inexistente: el 404 pasaba desapercibido
 * porque el valor nunca llegaba a ser null y el render lo daba por bueno.
 */
export const resolveMapImage = (mapName) => MAP_IMAGES[normMap(mapName || "")] || null;
