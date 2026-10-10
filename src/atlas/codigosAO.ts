/**
 * Leer los códigos AO/OTA que traen las fichas de Técnica AO (D-169, E6).
 *
 * `casos-ao.codigo` es **texto libre**, escrito por quien subió cada ficha, y las
 * 711 importadas de libros de técnica lo traen cada una a su manera: «42-A2»,
 * «43-C2 / 43-C3», «AO A2, A3, C1», «15.2-A2», «12A». Para poder buscar por
 * clasificación sin reescribirlas todas hace falta entender esas formas, y esto
 * es lo que las entiende. No inventa: lo que no se reconoce como un código no
 * existe, y una ficha sin código sigue accesible por «Ver todas».
 *
 * Sin `three` ni Payload: lo importa el navegador de la portada y las pruebas.
 *
 * ## Cómo se lee un código
 *
 * Un número de hueso, el segmento y, tras un guion opcional, el tipo y el grupo:
 *
 *  - `42-A2`: hueso 4 (tibia), segmento 2 (diáfisis), tipo A, grupo 2.
 *  - `43-C`: hueso 4, segmento 3 (distal), tipo C, sin grupo.
 *  - `2R2-A3`, `4F2-B`: radio y peroné, con su letra.
 *  - `15.2-A2`: clavícula; el punto separa el hueso del segmento.
 *  - `77.3.2-A3`, `78.2.1.2`: metacarpianos y falanges, con el rayo o el dedo.
 *  - `22-A3` es el antebrazo de la edición anterior: vale para el radio y el
 *    cúbito a la vez.
 *  - `42` a secas es hueso y segmento.
 *
 * Una lista («43-C2 / 43-C3», «A2, A3, C1») son varios códigos. Las letras sueltas
 * de una lista tras un código completo heredan su hueso y segmento: «43-C2, C3»
 * es 43-C2 y 43-C3.
 */

import { huesoAO, type GrupoAO, type HuesoAO, type SegmentoAO, type TipoAO } from './clasificacionAO'

export interface CodigoLeido {
  /** Los huesos que nombra: uno, salvo el antebrazo antiguo (`22`), que son dos. */
  huesos: HuesoAO[]
  segmento: SegmentoAO | null
  tipo: TipoAO | null
  /** El grupo con su número, tal como lo escribió: `A2`. */
  grupo: string | null
  /** El texto del que salió, para depurar. */
  texto: string
}

/** El prefijo numérico de un código → hueso. Los de una cifra son el hueso solo; los de dos, hueso + segmento. */
const HUESO_DE_LA_CIFRA: Readonly<Record<string, HuesoAO[]>> = {
  '1': ['humero'],
  '2': ['radio', 'cubito'],
  '3': ['femur'],
  '4': ['tibia'],
}

/**
 * Los códigos de una ficha. Lista vacía si el texto no trae ninguno.
 *
 * Se parte por separadores (`/`, `,`, `;`, `y`, saltos de línea) y cada trozo se
 * lee por su cuenta; las letras sueltas heredan lo del último código completo.
 */
export function leerCodigos(texto: string | null | undefined): CodigoLeido[] {
  if (!texto) return []
  const trozos = texto
    .replace(/\bAO\b/gi, ' ')
    .split(/[/,;\n]|\s+y\s+|\s+o\s+/i)
    .map((t) => t.trim())
    .filter(Boolean)

  const salida: CodigoLeido[] = []
  let ultimo: CodigoLeido | null = null
  for (const trozo of trozos) {
    const completo = leerUno(trozo)
    if (completo) {
      salida.push(completo)
      ultimo = completo
      continue
    }
    // «C3» tras «43-C2»: hereda hueso y segmento.
    const suelta = /^([ABC])\s*([123])?$/i.exec(trozo)
    if (suelta && ultimo) {
      const tipo = suelta[1].toUpperCase() as TipoAO
      salida.push({
        huesos: ultimo.huesos,
        segmento: ultimo.segmento,
        tipo,
        grupo: suelta[2] ? `${tipo}${suelta[2]}` : null,
        texto: trozo,
      })
    }
  }
  return salida
}

/** Un solo código, o `null` si el trozo no lo es. */
function leerUno(trozo: string): CodigoLeido | null {
  const t = trozo.trim().replace(/\s+/g, '')
  // Metacarpianos y falanges: 77.3.2-A3, 78.2.1.2, 87.1.2, 88.1.2.1. `__` es el rayo o el dedo que
  // el asistente no sabe cuando no se le dice qué pieza es (`77.__.2-A3`).
  const mano = /^(77|78|87|88)\.(\d|__)(?:\.(\d|__))?(?:\.(\d|__))?(?:-?([ABC])(\d)?)?$/i.exec(t)
  if (mano) {
    const hueso: HuesoAO = mano[1] === '77' ? 'metacarpiano' : mano[1] === '78' ? 'falange_mano' : mano[1] === '87' ? 'metatarsiano' : 'falange_pie'
    // En las falanges el dedo y la falange van antes del segmento: el segmento es el último dígito.
    const digitos = [mano[2], mano[3], mano[4]].filter((d): d is string => d !== undefined)
    const segmento = Number(digitos[digitos.length - 1])
    return armar([hueso], segmento, mano[5], mano[6], trozo)
  }
  // Clavícula: 15.2-A2 (el punto separa el hueso del segmento).
  const clavicula = /^15\.([123])(?:-?([ABC])(\d)?)?$/i.exec(t)
  if (clavicula) return armar(['clavicula'], Number(clavicula[1]), clavicula[2], clavicula[3], trozo)
  // Radio, cúbito y peroné con su letra: 2R2-A3, 2U2, 4F2-B. El segmento va tras la letra.
  const conLetra = /^(?:2([RU])|4F)([123])(?:-?([ABC])(\d)?)?$/i.exec(t)
  if (conLetra) {
    const hueso: HuesoAO = /^4F/i.test(t) ? 'peroneo' : conLetra[1].toUpperCase() === 'R' ? 'radio' : 'cubito'
    return armar([hueso], Number(conLetra[2]), conLetra[3], conLetra[4], trozo)
  }
  // El antiguo 22R-A3 / 22U-A3 (la letra después del segmento).
  const antiguoConLetra = /^2([123])([RU])(?:-?([ABC])(\d)?)?$/i.exec(t)
  if (antiguoConLetra) {
    const hueso: HuesoAO = antiguoConLetra[2].toUpperCase() === 'R' ? 'radio' : 'cubito'
    return armar([hueso], Number(antiguoConLetra[1]), antiguoConLetra[3], antiguoConLetra[4], trozo)
  }
  // Los largos: 42-A2, 43-C, 12A1, 31, 32-B3.
  const largo = /^([1-4])([1-4])(?:-?([ABC])(\d)?)?$/i.exec(t)
  if (largo) {
    const huesos = HUESO_DE_LA_CIFRA[largo[1]]
    const segmento = Number(largo[2])
    // El segmento 4 es el maléolo de la pierna (44); no existe en los demás.
    if (segmento === 4 && largo[1] !== '4') return null
    return armar(huesos, segmento === 4 ? null : segmento, largo[3], largo[4], trozo)
  }
  return null
}

function armar(
  huesos: HuesoAO[],
  segmento: number | null,
  tipo: string | undefined,
  grupo: string | undefined,
  texto: string,
): CodigoLeido | null {
  if (huesos.some((h) => !huesoAO(h))) return null
  if (segmento !== null && ![1, 2, 3].includes(segmento)) return null
  const t = tipo ? (tipo.toUpperCase() as TipoAO) : null
  return {
    huesos,
    segmento: segmento as SegmentoAO | null,
    tipo: t,
    grupo: t && grupo ? `${t}${grupo}` : null,
    texto,
  }
}

/** Lo que se ha elegido en el navegador por clasificación; cada paso afina el anterior. */
export interface FiltroDeClasificacion {
  hueso?: HuesoAO | null
  segmento?: SegmentoAO | null
  tipo?: TipoAO | null
  grupo?: GrupoAO | string | null
}

/**
 * ¿Algún código de la ficha cae dentro de lo elegido?
 *
 * Un código menos detallado que el filtro **sí** coincide con él: «43-C» responde
 * a «43-C2» porque no dice que no sea un C2, y esconderlo dejaría fuera justo las
 * fichas que hablan en general del tipo. Lo que no coincide nunca es un código que
 * dice otra cosa (otro hueso, otro segmento, otro tipo, otro grupo).
 */
export function coincideConLaClasificacion(codigos: readonly CodigoLeido[], f: FiltroDeClasificacion): boolean {
  if (!f.hueso && !f.segmento && !f.tipo && !f.grupo) return true
  return codigos.some((c) => {
    if (f.hueso && !c.huesos.includes(f.hueso)) return false
    if (f.segmento && c.segmento !== null && c.segmento !== f.segmento) return false
    if (f.segmento && c.segmento === null) return false
    if (f.tipo && c.tipo !== null && c.tipo !== f.tipo) return false
    if (f.tipo && c.tipo === null) return false
    if (f.grupo && c.grupo !== null && c.grupo !== f.grupo) return false
    if (f.grupo && c.grupo === null && c.tipo !== null && c.tipo !== String(f.grupo)[0]) return false
    return true
  })
}
