/**
 * Varios partners entregan el logo como silueta negra plana sobre transparente
 * (comprobado leyendo los píxeles: ENVY, MIBR, KC, Vitality... son 100% negro).
 * Contra el panel oscuro de la tarjeta desaparecen, y vlr.gg no sirve variante
 * blanca, así que hay que reencenderlos por CSS.
 *
 *  'white'   -> silueta blanca entera. Para los que son sólo negro.
 *  'red'     -> sube el negro a blanco conservando el acento rojo cálido.
 *  'crimson' -> igual, pero calibrado para un rojo más frío.
 *
 * El valor es el sufijo de la clase CSS (`.tcard__img--<valor>`); cada acento
 * lleva sus propios grados de giro porque no comparten tono.
 *
 * Clave = slug (el que genera `slugify` desde el nombre).
 */
export const TEAM_LOGO_TONE = {
  '100-thieves': 'red',       // el "100" a blanco, el swoosh sigue rojo
  'fut-esports': 'crimson',   // todo a blanco menos la estrella

  'envy': 'white',
  'mibr': 'white',
  'gentle-mates': 'white',
  'giantx': 'white',
  'karmine-corp': 'white',
  'team-vitality': 'white',
  'paper-rex': 'white',
  'team-secret': 'white',
  'varrel': 'white',
  'zeta-division': 'white',
};
