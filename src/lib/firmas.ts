/**
 * Las dos firmas de una ficha: la de un médico y la de un kinesiólogo (D-240).
 *
 * El dueño lo pidió así: «que cada ficha sea revisada por un médico y un
 * kinesiólogo, y que quede firmada por ambos». Hasta entonces bastaba con que un
 * revisor cualquiera pulsara «Listo para publicar» (D-142); ahora esa es la
 * mitad del camino, y la ficha queda lista cuando la otra profesión firma
 * también. Qué firma cada uno lo decide su cuenta (`usuarios.profesion`, que
 * pone el administrador), no lo que la persona elija al firmar: si se eligiera
 * en el momento, un mismo revisor podría firmar las dos.
 *
 * Aquí está solo lo que se calcula sin base —qué casillas hay, cuál le toca a
 * quién, qué falta—, para que el servidor, el editor, la tabla de «Por revisar»
 * y el papel digan lo mismo. Lo que escribe está en `revisionServidor.ts`.
 */

export const PROFESIONES = [
  { valor: 'medico', etiqueta: 'Médico', comoFirma: 'como médico', alguien: 'un médico' },
  { valor: 'kinesiologo', etiqueta: 'Kinesiólogo', comoFirma: 'como kinesiólogo', alguien: 'un kinesiólogo' },
] as const

export type Profesion = (typeof PROFESIONES)[number]['valor']

export const esProfesion = (valor: unknown): valor is Profesion => PROFESIONES.some((p) => p.valor === valor)

const DATOS = Object.fromEntries(PROFESIONES.map((p) => [p.valor, p])) as Record<
  Profesion,
  (typeof PROFESIONES)[number]
>

export const etiquetaDeProfesion = (valor: unknown): string => (esProfesion(valor) ? DATOS[valor].etiqueta : '')
export const firmaComo = (profesion: Profesion): string => DATOS[profesion].comoFirma
export const alguienDe = (profesion: Profesion): string => DATOS[profesion].alguien
export const laOtra = (profesion: Profesion): Profesion => (profesion === 'medico' ? 'kinesiologo' : 'medico')

/**
 * Los campos de `revisiones` donde vive cada firma. Escritos uno por uno y no
 * armados con plantillas, para que una búsqueda por el nombre del campo los
 * encuentre aquí.
 */
export const CAMPOS_DE_FIRMA = {
  medico: { por: 'firmaMedicoPor', en: 'firmaMedicoEn' },
  kinesiologo: { por: 'firmaKinesiologoPor', en: 'firmaKinesiologoEn' },
} as const satisfies Record<Profesion, { por: string; en: string }>

/** Una firma puesta: quién (su id, o su nombre si la fila trae la cuenta) y cuándo. */
export interface Firma {
  por: string | null
  nombre: string | null
  en: string
}

export type FirmasDeLaFicha = Record<Profesion, Firma | null>

const idONombre = (valor: unknown): { por: string | null; nombre: string | null } => {
  if (valor === null || valor === undefined || valor === '') return { por: null, nombre: null }
  if (typeof valor === 'object') {
    const cuenta = valor as { id?: unknown; nombre?: unknown; email?: unknown }
    const nombre =
      (typeof cuenta.nombre === 'string' && cuenta.nombre.trim()) ||
      (typeof cuenta.email === 'string' && cuenta.email) ||
      null
    return { por: cuenta.id === undefined ? null : String(cuenta.id), nombre }
  }
  return { por: String(valor), nombre: null }
}

/**
 * Las dos firmas de una fila de `revisiones`, venga la cuenta como id (consulta
 * con `depth: 0`) o como documento (`depth: 1`).
 *
 * Lo que manda es la fecha: una firma sin fecha no es una firma. La cuenta puede
 * faltar con la fecha puesta —se borró la cuenta de quien firmó, y la relación
 * quedó a nulo—, y esa firma sigue valiendo: alguien la firmó y la base sabe
 * cuándo, aunque ya no sepa quién.
 */
export function firmasDe(fila: Record<string, unknown>): FirmasDeLaFicha {
  const una = (profesion: Profesion): Firma | null => {
    const campos = CAMPOS_DE_FIRMA[profesion]
    const en = fila[campos.en]
    if (typeof en !== 'string' || en === '') return null
    return { ...idONombre(fila[campos.por]), en }
  }
  return { medico: una('medico'), kinesiologo: una('kinesiologo') }
}

export const tieneLasDos = (firmas: FirmasDeLaFicha): boolean => firmas.medico !== null && firmas.kinesiologo !== null
export const tieneAlguna = (firmas: FirmasDeLaFicha): boolean => firmas.medico !== null || firmas.kinesiologo !== null

/** Las profesiones cuya firma falta, en el orden de `PROFESIONES`. */
export const firmasQueFaltan = (firmas: FirmasDeLaFicha): Profesion[] =>
  PROFESIONES.map((p) => p.valor).filter((p) => firmas[p] === null)

/**
 * Lo que la firma de una cuenta le hace a una ficha, o por qué no puede firmar.
 *
 * `null` es «puede firmar». Si no, la frase que se le enseña, que dice qué hacer:
 * a quien no tiene profesión, a quién pedírsela; a quien ya firmó, que no hace
 * falta otra vez; a quien llega tarde, quién firmó por su profesión.
 */
export function porQueNoPuedeFirmar(
  firmas: FirmasDeLaFicha,
  cuenta: { id: string; profesion: unknown },
): string | null {
  if (!esProfesion(cuenta.profesion)) {
    return 'Su cuenta no dice si es médico o kinesiólogo, y eso decide qué firma pone. Pídale al administrador que lo indique en «Usuarios y permisos».'
  }
  if (tieneLasDos(firmas)) return 'Esta ficha ya tiene las dos firmas.'
  const suya = firmas[cuenta.profesion]
  if (suya === null) return null
  if (suya.por === cuenta.id) return `Usted ya la firmó ${firmaComo(cuenta.profesion)}. Falta la firma de ${alguienDe(laOtra(cuenta.profesion))}.`
  return `Ya la firmó ${alguienDe(cuenta.profesion)}${suya.nombre ? ` (${suya.nombre})` : ''}. Falta la firma de ${alguienDe(laOtra(cuenta.profesion))}.`
}

/**
 * Las firmas en una línea, para la tabla de «Por revisar», la auditoría y el
 * papel: «Médico: Dra. Vega · Kinesiólogo: falta».
 */
export function firmasEnPalabras(firmas: FirmasDeLaFicha): string {
  return PROFESIONES.map(({ valor, etiqueta }) => {
    const firma = firmas[valor]
    return `${etiqueta}: ${firma === null ? 'falta' : (firma.nombre ?? 'cuenta borrada')}`
  }).join(' · ')
}

/**
 * La huella de un documento: un texto que cambia si cambia cualquier cosa de lo
 * que se firmó, y que no cambia si no cambia nada.
 *
 * Las claves se ordenan antes de serializar: dos lecturas del mismo documento
 * pueden traer las propiedades en distinto orden, y sin ordenar parecerían dos
 * textos distintos. La huella no es un resumen criptográfico porque no hace
 * falta: se compara con la del mismo documento y nunca sale del servidor.
 * `revisionServidor.ts` la pasa por SHA-256 para no guardar la ficha entera dos
 * veces en la base.
 */
export function textoParaLaHuella(valor: unknown): string {
  const ordenado = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordenado)
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, ordenado((v as Record<string, unknown>)[k])]),
      )
    }
    return v
  }
  return JSON.stringify(ordenado(valor ?? null))
}
