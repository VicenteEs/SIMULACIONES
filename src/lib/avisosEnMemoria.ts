/**
 * Los avisos vigentes que guarda cada proceso por medio minuto
 * (`avisosServidor.ts`, D-406).
 *
 * Aparte, y sin importar nada, porque lo borra el gancho de `difusiones`: la
 * colección no puede arrastrar el módulo de los avisos, que lee la dirección
 * pública de `Usuarios.ts`, sin entrar en un ciclo de importaciones entre
 * colecciones.
 */

export interface AvisoVigente {
  id: string
  asunto: string
  mensaje: string
  botonTexto: string | null
  botonEnlace: string | null
  audiencia: string
  lugares: string[] | null
  creado: string
}

interface Guardados {
  lista: AvisoVigente[]
  hasta: number
}

/**
 * Cuelga de `globalThis`, como el limitador de `ritmo.ts`. La primera versión
 * era una variable del módulo, y con la compilación de producción no servía:
 * Next puede cargar el mismo módulo en más de un paquete de servidor —el de
 * las acciones y el de las páginas—, el gancho borraba una copia y la barra
 * leía otra. Un aviso publicado o retirado tardaba el medio minuto entero en
 * verse. Las pruebas no lo ven, porque corren todo con una sola copia del
 * módulo; lo vio la prueba en el navegador contra `next start`.
 */
const LLAVE = Symbol.for('traumahub.avisosVigentes')

const almacen = () => globalThis as unknown as { [LLAVE]?: Guardados | null }

export function avisosGuardados(ahora: number): AvisoVigente[] | null {
  const guardados = almacen()[LLAVE]
  return guardados && guardados.hasta > ahora ? guardados.lista : null
}

export function guardarAvisos(lista: AvisoVigente[], hasta: number): void {
  almacen()[LLAVE] = { lista, hasta }
}

/** Lo llama el gancho de `difusiones` al escribir una: el aviso nuevo, o el retirado, se ve en este proceso enseguida. */
export function olvidarAvisos(): void {
  almacen()[LLAVE] = null
}
