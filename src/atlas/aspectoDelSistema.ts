/**
 * El aspecto de cada sistema del atlas: cuánto brilla, cuánto deja ver a través (P-006, F-11).
 *
 * Hasta las fascias todos los sistemas se pintaban igual —rugosidad 0,72, metal 0,02, macizos— y solo
 * cambiaba el color, que vive en el catálogo. Una fascia no se parece a un músculo ni a un hueso: es
 * una lámina húmeda, nacarada y semitransparente, con un rayado fino de fibras de colágeno. Aquí se
 * declara cuánto, en un sitio, para que lo lean el material del taller (`cargador.ts`), el escritor de
 * glTF (`exportarAtlas.ts` → `glb.ts`) y el guion de Blender (`scripts/atlas/fascias/vista_en_blender.py`,
 * que lee la copia de estos valores que lleva el propio `.glb`): cambiar un valor aquí cambia los tres.
 *
 * Es puro y sin imports: lo leen el navegador, el servidor y las pruebas.
 *
 * Los valores de las fascias son de partida y se afinan mirando Blender (P-006, E4): lo que no se ve
 * bien allí no se ve bien en ninguna parte.
 */

export interface AspectoDelSistema {
  /** De 0 (espejo) a 1 (mate). */
  rugosidad: number
  /** De 0 a 1. Ninguno de los tejidos del atlas es metálico; queda para los implantes. */
  metalico: number
  /**
   * Con cuánta opacidad se pinta una pieza de este sistema en el taller mientras nadie le diga otra (D-134).
   * Es la misma trama de píxeles que el 30 % de la piel: lo que está detrás se sigue viendo.
   */
  opacidadInicial: number
  /**
   * Con cuánta opacidad sale en el `.glb`. Mayor que la del taller: allí la trama de píxeles come detalle, y
   * en la consola la fascia tiene que verse como la lámina que es, no como un fantasma. 1 es maciza.
   */
  opacidadDelModelo: number
  /**
   * El brillo sedoso de las fibras (`KHR_materials_sheen`): el halo claro en el borde de una superficie de
   * hilos, que es lo que hace que la fascia se lea como colágeno y no como plástico. De 0 a 1; 0 no lo escribe.
   */
  brilloSedoso: number
  /** El barniz húmedo de una serosa (`KHR_materials_clearcoat`). De 0 a 1; 0 no lo escribe. */
  barniz: number
  /**
   * Si lleva un rayado de fibras largas, dibujado en el material según la posición (no se guardan
   * coordenadas de textura: ver F-12). Solo lo lee el taller y el guion de Blender.
   */
  fibras: boolean
}

/** Lo de siempre: el aspecto de todo lo que no se declara abajo. Con estos valores el `.glb` sale como antes de que existiera esta tabla. */
export const ASPECTO_POR_OMISION: Readonly<AspectoDelSistema> = {
  rugosidad: 0.72,
  metalico: 0.02,
  opacidadInicial: 1,
  opacidadDelModelo: 1,
  brilloSedoso: 0,
  barniz: 0,
  fibras: false,
}

const ASPECTO_POR_SISTEMA: Readonly<Record<string, Partial<AspectoDelSistema>>> = {
  // La tela subcutánea: grasa y tejido laxo, brillo apagado.
  'fascia-superficial': { rugosidad: 0.55, opacidadInicial: 0.4, opacidadDelModelo: 0.45, brilloSedoso: 0.2 },
  // La lámina nacarada de la imagen A del PDF de Cristóbal: húmeda, con brillo y con fibras longitudinales.
  'fascia-profunda': { rugosidad: 0.35, opacidadInicial: 0.45, opacidadDelModelo: 0.6, brilloSedoso: 0.7, fibras: true },
  // Duramadre: tensa y algo menos brillante que una serosa.
  'fascia-meningea': { rugosidad: 0.3, opacidadInicial: 0.5, opacidadDelModelo: 0.65, brilloSedoso: 0.3 },
  // Las serosas son lo más liso y lo más húmedo del cuerpo.
  'fascia-visceral': { rugosidad: 0.18, opacidadInicial: 0.4, opacidadDelModelo: 0.5, brilloSedoso: 0.3, barniz: 0.8 },
}

export function aspectoDelSistema(sistema: string): AspectoDelSistema {
  return { ...ASPECTO_POR_OMISION, ...(ASPECTO_POR_SISTEMA[sistema] ?? {}) }
}
