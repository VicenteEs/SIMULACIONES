/**
 * Lo que el editor del simulador recuerda de su ensayo mientras la pestaña esté abierta.
 *
 * Sale de un hallazgo que Cristóbal contó sin saber qué lo causaba: «cuando intento poner el
 * separador o usar el bisturí profundo, se borra la incisión del primer bisturí». Lo que pasaba:
 * en un caso **nuevo**, guardar el borrador por primera vez crea la ficha y cambia la dirección
 * (`/nuevo` pasa a `/<id>`), y al cambiar de página el editor entero se vuelve a montar —el lienzo
 * incluido—, con lo que se perdía la incisión, el instrumento en la mano y el paso en que se
 * estaba. En una ficha ya guardada no ocurría: guardar solo refresca los datos.
 *
 * La incisión y lo cosido ya se recordaban (`serializarSesion`, D-171), pero con una clave que
 * llevaba el identificador de la ficha, que es justo lo que cambia al guardar por primera vez. Ahora
 * la clave del editor es **el modelo**, que no cambia, y esto recuerda lo demás: en qué paso se
 * estaba, qué instrumento había en la mano y con qué ajustes.
 *
 * Es de la pestaña (`sessionStorage`) y no de la cuenta: cerrar la pestaña lo borra, como debe ser
 * con un ensayo. Con el almacenamiento bloqueado todo sigue funcionando; solo no se recuerda.
 */

export interface EnsayoDeLaConsola {
  v: 1
  instrumento: string | null
  modo: string | null
  tipoDeTrazo: 'recto' | 'libre'
  modoElectro: 'corte' | 'coagulacion'
  potenciaW: number
}

const PREFIJO = 'trauma-ensayo'

export const claveDelPasoDelEditor = (idDelModelo: string): string => `${PREFIJO}-paso:${idDelModelo}`
export const claveDeLaConsolaDelEditor = (direccionDelModelo: string): string => `${PREFIJO}-consola:${direccionDelModelo}`

function leer(clave: string): unknown {
  try {
    const crudo = sessionStorage.getItem(clave)
    return crudo ? JSON.parse(crudo) : null
  } catch {
    return null
  }
}

function escribir(clave: string, valor: unknown) {
  try {
    sessionStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Sin almacenamiento (navegación privada, cuota): el editor sigue; solo no se recuerda.
  }
}

/** El paso en que se estaba, o `null` si no hay nada guardado. */
export function leerPasoDelEditor(clave: string): number | null {
  const v = leer(clave)
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

export const guardarPasoDelEditor = (clave: string, indice: number) => escribir(clave, indice)

export function leerEnsayoDeLaConsola(clave: string): EnsayoDeLaConsola | null {
  const v = leer(clave) as Partial<EnsayoDeLaConsola> | null
  if (!v || v.v !== 1) return null
  return {
    v: 1,
    instrumento: typeof v.instrumento === 'string' ? v.instrumento : null,
    modo: typeof v.modo === 'string' ? v.modo : null,
    tipoDeTrazo: v.tipoDeTrazo === 'libre' ? 'libre' : 'recto',
    modoElectro: v.modoElectro === 'coagulacion' ? 'coagulacion' : 'corte',
    potenciaW: typeof v.potenciaW === 'number' && Number.isFinite(v.potenciaW) ? v.potenciaW : 35,
  }
}

export const guardarEnsayoDeLaConsola = (clave: string, ensayo: EnsayoDeLaConsola) => escribir(clave, ensayo)
