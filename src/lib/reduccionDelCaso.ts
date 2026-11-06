/**
 * Si un caso tiene algo que reducir, mirado en lo que guarda la fila y no en la escena (D-306).
 *
 * Es la mitad de la regla que se puede decidir sin abrir el modelo: la usan la colección al publicar
 * (`exigeElRangoDeSuObjetivo`, en `src/collections/Cirugias.ts`) y el panel al adelantar el motivo en español
 * (`revisarAlPublicar` de la sección «Simulador», en `src/admin/esquema.ts`). La otra mitad —si el desplazamiento
 * escrito cabe dentro de los topes, o si el modelo trae la referencia en sus `extras`— solo la sabe la consola, con el
 * trozo ya colocado, y está en `pasosSinNadaQueReducir` (`src/lib/simulador.ts`).
 *
 * Vive aparte, sin nada de la consola, porque la importa el esquema del panel, que a su vez importa la colección del
 * servidor: lo que entre aquí viaja a los dos lados.
 *
 * Mira lo que hay en la fila y no lo que el modelo podría traer. Un modelo nuevo del taller trae la posición reducida
 * en los `extras` del trozo (D-304), y la consola la usa aunque la fila no la tenga; aquí no se ve, así que un caso así
 * se corta hasta que el editor pulse «Rellenar desde el modelo», que la copia a la fila. Es un clic, y a cambio lo que
 * decide la nota queda escrito en el caso y no escondido en un archivo que se puede volver a exportar.
 */

import { esCasiIdentidad, transformacionValida } from './transformacionRigida'

/** Sin una pieza marcada como fragmento no hay trozo que mover ni que medir. */
export const SIN_FRAGMENTO_QUE_REDUCIR =
  'Un paso de reducción necesita una pieza marcada como «Fragmento móvil»: es la que el residente mueve y la que se mide. Sin ella, la consola mide ceros y el paso se aprueba sin tocar nada.'

/** El fragmento está marcado, pero el caso no dice ni de dónde sale ni a dónde va. */
export const SIN_REFERENCIA_DE_LA_REDUCCION =
  'Un paso de reducción necesita algo que reducir: escriba el «Desplazamiento inicial de la fractura» si el modelo trae el hueso reducido, o pulse «Rellenar desde el modelo» si lo exportó el taller con el trozo desplazado, para traer su posición reducida. Sin ninguna de las dos, el trozo empieza en su sitio y el paso se aprueba sin mover nada.'

const CLAVES_DEL_DESPLAZAMIENTO = ['x', 'y', 'z', 'giroX', 'giroY', 'giroZ'] as const

const comoObjeto = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {}

/**
 * Por qué el caso no tiene nada que reducir, o `null` si lo tiene.
 *
 * Basta con uno de los dos convenios:
 * - el de D-058: el modelo trae el hueso reducido y la fila escribe cuánto está desplazado al empezar;
 * - el de P-008 E5 y D-304: el modelo trae el trozo desplazado y la fila guarda su posición reducida.
 *
 * Una posición reducida que no mueve nada no cuenta: es lo que escribe el taller para un trozo que no desplazó, y con
 * ella el trozo empieza en su sitio igual que sin ella.
 */
export function motivoSinNadaQueReducir(caso: unknown): string | null {
  const c = comoObjeto(caso)
  const piezas = Array.isArray(c.piezas) ? c.piezas.map(comoObjeto) : []
  // La primera, como la consola: «marque una sola», y si hay dos es la primera la que se mueve.
  const fragmento = piezas.find((p) => p.rol === 'fragmento')
  if (!fragmento) return SIN_FRAGMENTO_QUE_REDUCIR

  const d = comoObjeto(c.desplazamientoInicial)
  const desplazado = CLAVES_DEL_DESPLAZAMIENTO.some((k) => {
    const n = d[k]
    return typeof n === 'number' && Number.isFinite(n) && n !== 0
  })
  if (desplazado) return null

  const reducida = transformacionValida(fragmento.posicionReducida)
  const escala = typeof c.milimetrosPorUnidad === 'number' && c.milimetrosPorUnidad > 0 ? c.milimetrosPorUnidad : 1000
  if (reducida && !esCasiIdentidad(reducida, escala)) return null

  return SIN_REFERENCIA_DE_LA_REDUCCION
}

/**
 * Lo que el panel dice antes de publicar: un aviso por caso, con los pasos que alcanza, o nada.
 *
 * Uno solo y no uno por paso: el motivo es del caso, y repetirlo en cada fila de reducción diría lo mismo dos veces.
 */
export function revisarLaReduccionDelCaso(documento: Record<string, unknown>): string[] {
  const pasos = Array.isArray(documento.pasos) ? documento.pasos.map(comoObjeto) : []
  const deReduccion = pasos.flatMap((p, i) => (p.objetivo === 'reduccion' ? [i + 1] : []))
  if (deReduccion.length === 0) return []
  const motivo = motivoSinNadaQueReducir(documento)
  if (!motivo) return []
  const donde =
    deReduccion.length === 1
      ? `En paso ${deReduccion[0]}`
      : `En los pasos ${deReduccion.slice(0, -1).join(', ')} y ${deReduccion[deReduccion.length - 1]}`
  return [`${donde}: ${motivo}`]
}
