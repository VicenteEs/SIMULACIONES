import type { EstadoDeRevision } from './revision'

/**
 * El tono de cada estado, en un solo sitio para la insignia y para el gráfico.
 *
 * Antes eran dos paletas que no se conocían: la insignia de «Publicada» salía
 * gris (`.revision-estado-publicada`) y su segmento en el gráfico de la
 * auditoría, violeta (`--estado-publicada`); «Devuelta» era rojo oscuro en la
 * tabla y rojo claro en la barra. Quien pasaba de la leyenda a la tabla tenía
 * que volver a aprender qué color era qué. Ahora el estado elige un tono, y el
 * tono da a la vez la clase de la insignia (`.insignia-*` de `ui.css`) y el
 * color del gráfico (`--tono-*` de `admin-panel/panel.css`).
 *
 * Cinco tonos por lo que significan, no por el color que tocaba: lo que espera
 * a alguien es atención, lo que está en manos de alguien es información, lo
 * que está listo es correcto, lo que volvió es peligro y lo que ya salió del
 * flujo es neutro. Un estado nuevo se añade aquí y nada más.
 */
export type Tono = 'ok' | 'atencion' | 'peligro' | 'info' | 'neutra'

export const TONO_DE_REVISION: Record<EstadoDeRevision, Tono> = {
  pendiente: 'atencion',
  'en-revision': 'info',
  lista: 'ok',
  publicada: 'neutra',
  devuelta: 'peligro',
}

/** Publicado o borrador de una ficha. */
export const tonoDePublicacion = (publicado: boolean): Tono => (publicado ? 'ok' : 'atencion')

/** Un estado que no se conoce sale neutro: mejor gris que sin estilo. */
export const tonoDeRevision = (estado: string): Tono =>
  TONO_DE_REVISION[estado as EstadoDeRevision] ?? 'neutra'

/** La clase de la insignia: `<span className={claseDeInsignia('ok')}>`. */
export const claseDeInsignia = (tono: Tono) => `insignia insignia-${tono}`

/**
 * El color del tono para un gráfico. Es una variable y no un hexadecimal para
 * que la paleta siga viviendo en las hojas: el SVG la resuelve igual.
 */
export const colorDeTono = (tono: Tono) => `var(--tono-${tono})`
