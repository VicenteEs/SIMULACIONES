/**
 * Un lector mínimo de planillas `.xlsx` (D-179, P-003 E8).
 *
 * La plataforma ya **escribe** Excel (`src/lib/planilla.ts`, D-143) y nunca había
 * tenido que leerlo. El listado de estructuras sí: el editor descarga la planilla
 * de una región, la llena —con una IA, o a mano— y la sube. Las bibliotecas que
 * leen `.xlsx` traen fórmulas, gráficos y estilos que aquí no hacen falta (y la
 * más conocida pesa varios megas y lleva años sin parches), así que se escribe lo
 * que cabe en una página, por el mismo motivo por el que `zip.ts` y `planilla.ts`
 * se escribieron a mano.
 *
 * ## Qué lee
 *
 * Un libro es un ZIP con XML. De ahí salen, y solo eso: los nombres de las hojas
 * (`xl/workbook.xml` y sus relaciones), la tabla de textos compartidos
 * (`xl/sharedStrings.xml`) y cada hoja (`xl/worksheets/*.xml`). Cada celda se
 * devuelve **como texto**: un número queda como el número que escribió Excel, un
 * texto en línea o compartido como su texto, una fórmula como el último valor que
 * calculó. Las fechas no se interpretan: no hay ninguna en estas planillas.
 *
 * Lee lo que escribe `crearPlanilla` y lo que guardan Excel, LibreOffice y Google
 * Sheets (se probó con los tres estilos de celda: compartida, en línea y fórmula),
 * con o sin prefijo de espacio de nombres en las etiquetas. No lee `.xls` antiguo,
 * `.csv`, `.ods` ni libros con contraseña, y lo dice con su nombre.
 *
 * ## Lo que se cuida
 *
 * Un archivo subido es **entrada de un tercero**. El ZIP se valida antes de
 * descomprimir nada: el CRC-32 de cada entrada tiene que cuadrar (un archivo
 * truncado se rechaza en vez de leerse a medias), y hay topes de entradas, de
 * tamaño descomprimido y de filas y columnas, de modo que un «ZIP bomba» de unos
 * kilobytes no se convierta en gigabytes en memoria. Ningún nombre de entrada se
 * usa como ruta del disco: todo se lee en memoria.
 *
 * Solo de servidor: usa `node:zlib`.
 */
import { inflateRawSync } from 'node:zlib'
import { crc32 } from './zip'

/** Lo que se rechaza: el mensaje está pensado para leerse en pantalla. */
export class PlanillaIlegible extends Error {}

export interface HojaLeida {
  nombre: string
  /** Una fila por fila de la hoja; una celda sin nada es `''`. Las filas vacías del principio se conservan. */
  filas: string[][]
}

/** Topes contra archivos hechos para reventar la memoria. Una planilla de verdad no pasa de cien kilobytes. */
const MAXIMO_DE_ENTRADAS = 500
const MAXIMO_DESCOMPRIMIDO_POR_ENTRADA = 64 * 1024 * 1024
const MAXIMO_DESCOMPRIMIDO_TOTAL = 128 * 1024 * 1024
const MAXIMO_DE_FILAS = 20_000
const MAXIMO_DE_COLUMNAS = 100

// ---------------------------------------------------------------------- ZIP

interface EntradaDelZip {
  metodo: number
  crc: number
  comprimido: number
  descomprimido: number
  desplazamiento: number
}

/**
 * El directorio central de un ZIP: nombre → dónde está y cómo se descomprime.
 *
 * Se lee el **directorio central** y no las cabeceras locales una tras otra,
 * porque es lo único que trae los tamaños verdaderos cuando el archivo se escribió
 * «en flujo» (con el tamaño en un descriptor de datos al final de cada entrada),
 * que es como lo guardan algunas herramientas.
 */
function leerDirectorio(datos: Uint8Array): Map<string, EntradaDelZip> {
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength)
  // El registro de fin del directorio está al final, detrás de un comentario de hasta 64 KB.
  let fin = -1
  for (let i = datos.length - 22; i >= Math.max(0, datos.length - 22 - 0xffff); i -= 1) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i
      break
    }
  }
  if (fin < 0) {
    throw new PlanillaIlegible(
      'El archivo no es una planilla de Excel (.xlsx). Si es un .xls o un .csv, ábralo en Excel y guárdelo como «Libro de Excel (.xlsx)».',
    )
  }
  const cuantas = vista.getUint16(fin + 10, true)
  const desplazamientoDelDirectorio = vista.getUint32(fin + 16, true)
  if (cuantas === 0xffff || desplazamientoDelDirectorio === 0xffffffff) {
    throw new PlanillaIlegible('La planilla usa el formato ZIP64, que este lector no admite. Guárdela de nuevo desde Excel.')
  }
  if (cuantas > MAXIMO_DE_ENTRADAS) throw new PlanillaIlegible('La planilla tiene demasiadas partes: no parece una planilla de Excel.')

  const entradas = new Map<string, EntradaDelZip>()
  const decodificador = new TextDecoder('utf-8')
  let posicion = desplazamientoDelDirectorio
  let total = 0
  for (let n = 0; n < cuantas; n += 1) {
    if (posicion + 46 > datos.length || vista.getUint32(posicion, true) !== 0x02014b50) {
      throw new PlanillaIlegible('La planilla está dañada: su índice interno no se puede leer.')
    }
    const banderas = vista.getUint16(posicion + 8, true)
    const metodo = vista.getUint16(posicion + 10, true)
    const crc = vista.getUint32(posicion + 16, true)
    const comprimido = vista.getUint32(posicion + 20, true)
    const descomprimido = vista.getUint32(posicion + 24, true)
    const largoDelNombre = vista.getUint16(posicion + 28, true)
    const largoDelExtra = vista.getUint16(posicion + 30, true)
    const largoDelComentario = vista.getUint16(posicion + 32, true)
    const desplazamiento = vista.getUint32(posicion + 42, true)
    const nombre = decodificador.decode(datos.subarray(posicion + 46, posicion + 46 + largoDelNombre))
    if (banderas & 1) throw new PlanillaIlegible('La planilla tiene contraseña. Quítela en Excel y guárdela de nuevo.')
    if (comprimido === 0xffffffff || descomprimido === 0xffffffff) {
      throw new PlanillaIlegible('La planilla usa el formato ZIP64, que este lector no admite. Guárdela de nuevo desde Excel.')
    }
    if (descomprimido > MAXIMO_DESCOMPRIMIDO_POR_ENTRADA) {
      throw new PlanillaIlegible('Una parte de la planilla es enormemente grande: no parece una planilla de Excel.')
    }
    total += descomprimido
    if (total > MAXIMO_DESCOMPRIMIDO_TOTAL) throw new PlanillaIlegible('La planilla ocupa demasiado una vez abierta: no parece una planilla de Excel.')
    entradas.set(nombre, { metodo, crc, comprimido, descomprimido, desplazamiento })
    posicion += 46 + largoDelNombre + largoDelExtra + largoDelComentario
  }
  return entradas
}

/** El contenido de una entrada, descomprimido y con su CRC-32 comprobado; `null` si no existe. */
function leerEntrada(datos: Uint8Array, entradas: Map<string, EntradaDelZip>, nombre: string): Uint8Array | null {
  const entrada = entradas.get(nombre)
  if (!entrada) return null
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength)
  const { desplazamiento } = entrada
  if (desplazamiento + 30 > datos.length || vista.getUint32(desplazamiento, true) !== 0x04034b50) {
    throw new PlanillaIlegible('La planilla está dañada: una de sus partes no se encuentra.')
  }
  const inicio = desplazamiento + 30 + vista.getUint16(desplazamiento + 26, true) + vista.getUint16(desplazamiento + 28, true)
  const crudo = datos.subarray(inicio, inicio + entrada.comprimido)
  if (crudo.length !== entrada.comprimido) throw new PlanillaIlegible('La planilla está incompleta: el archivo se cortó. Vuelva a descargarla o a guardarla.')

  let salida: Uint8Array
  if (entrada.metodo === 0) salida = crudo
  else if (entrada.metodo === 8) {
    try {
      // `maxOutputLength` es lo que para un ZIP bomba: sin él, la entrada diría 1 KB y expandiría a gigabytes.
      salida = new Uint8Array(inflateRawSync(crudo, { maxOutputLength: entrada.descomprimido + 1 }))
    } catch {
      throw new PlanillaIlegible('La planilla está dañada: una de sus partes no se puede descomprimir.')
    }
  } else {
    throw new PlanillaIlegible('La planilla usa una compresión que este lector no admite. Guárdela de nuevo desde Excel.')
  }
  if (salida.length !== entrada.descomprimido || crc32(salida) !== entrada.crc) {
    throw new PlanillaIlegible('La planilla está dañada: el contenido no coincide con su suma de control. Vuelva a descargarla o a guardarla.')
  }
  return salida
}

// ---------------------------------------------------------------------- XML

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Deshace las entidades de XML: las cinco con nombre y las numéricas (`&#233;`, `&#xE9;`). */
export function desescaparXml(texto: string): string {
  return texto.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (entera, cuerpo: string) => {
    if (cuerpo[0] === '#') {
      const codigo = cuerpo[1] === 'x' || cuerpo[1] === 'X' ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10)
      return Number.isFinite(codigo) && codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : ''
    }
    return ENTIDADES[cuerpo] ?? entera
  })
}

const comoTexto = (bytes: Uint8Array): string => new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '')

/** El valor de un atributo de una etiqueta (`name="Hoja 1"`), sin importar el orden ni las comillas. */
function atributo(etiqueta: string, nombre: string): string | null {
  const encontrado = new RegExp(`(?:^|\\s)(?:\\w+:)?${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(etiqueta)
  return encontrado ? desescaparXml(encontrado[1] ?? encontrado[2] ?? '') : null
}

/** El texto de un bloque `<si>` o `<is>`: todos sus `<t>` pegados, sin la lectura fonética (`<rPh>`). */
function textoDeUnBloque(bloque: string): string {
  const sinFonetica = bloque.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '')
  let texto = ''
  for (const t of sinFonetica.matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) texto += desescaparXml(t[1] ?? '')
  return texto
}

function leerTextosCompartidos(xml: string | null): string[] {
  if (!xml) return []
  return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)].map((m) => textoDeUnBloque(m[1] ?? ''))
}

/** La columna de una referencia de celda: `A1` → 0, `AB7` → 27. */
function columnaDe(referencia: string): number {
  const letras = /^[A-Za-z]+/.exec(referencia)?.[0].toUpperCase() ?? ''
  let n = 0
  for (const letra of letras) n = n * 26 + (letra.charCodeAt(0) - 64)
  return n - 1
}

const filaDe = (referencia: string): number => Number(/[0-9]+$/.exec(referencia)?.[0] ?? '0') - 1

function leerHoja(xml: string, textos: readonly string[]): string[][] {
  const filas: string[][] = []
  // Una celda con o sin contenido: `<c r="A1" t="s"><v>3</v></c>` o `<c r="B1" s="2"/>`.
  for (const celda of xml.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
    const etiqueta = celda[1]
    const cuerpo = celda[2] ?? ''
    const referencia = atributo(etiqueta, 'r')
    if (!referencia) continue
    const columna = columnaDe(referencia)
    const fila = filaDe(referencia)
    if (columna < 0 || fila < 0) continue
    if (fila >= MAXIMO_DE_FILAS || columna >= MAXIMO_DE_COLUMNAS) {
      throw new PlanillaIlegible(`La hoja es demasiado grande (más de ${MAXIMO_DE_FILAS} filas o ${MAXIMO_DE_COLUMNAS} columnas).`)
    }
    const tipo = atributo(etiqueta, 't')
    let valor = ''
    if (tipo === 'inlineStr') {
      valor = textoDeUnBloque(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(cuerpo)?.[1] ?? '')
    } else {
      const v = /<(?:\w+:)?v\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?v>)/.exec(cuerpo)?.[1]
      if (v !== undefined) {
        if (tipo === 's') valor = textos[Number(v)] ?? ''
        else if (tipo === 'e') valor = ''
        else valor = desescaparXml(v)
      }
    }
    if (valor === '') continue
    while (filas.length <= fila) filas.push([])
    const lista = filas[fila]
    while (lista.length <= columna) lista.push('')
    lista[columna] = valor
  }
  return filas
}

// ------------------------------------------------------------------ el libro

/**
 * Las hojas de un `.xlsx`, en el orden del libro.
 *
 * Lanza `PlanillaIlegible` con un motivo legible si el archivo no es una planilla,
 * está dañado o es de un formato que no se lee. No lanza por una celda rara: lo
 * que no entiende lo deja vacío.
 */
export function leerPlanilla(datos: Uint8Array): HojaLeida[] {
  if (datos.length < 22 || datos[0] !== 0x50 || datos[1] !== 0x4b) {
    throw new PlanillaIlegible(
      'El archivo no es una planilla de Excel (.xlsx). Si es un .xls o un .csv, ábralo en Excel y guárdelo como «Libro de Excel (.xlsx)».',
    )
  }
  const entradas = leerDirectorio(datos)
  const libro = leerEntrada(datos, entradas, 'xl/workbook.xml')
  if (!libro) throw new PlanillaIlegible('El archivo es un ZIP pero no una planilla de Excel: falta el libro (xl/workbook.xml).')

  const relaciones = new Map<string, string>()
  const xmlDeRelaciones = leerEntrada(datos, entradas, 'xl/_rels/workbook.xml.rels')
  if (xmlDeRelaciones) {
    for (const r of comoTexto(xmlDeRelaciones).matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) {
      const id = atributo(r[1], 'Id')
      const destino = atributo(r[1], 'Target')
      if (id && destino) relaciones.set(id, destino)
    }
  }

  const compartidos = leerEntrada(datos, entradas, 'xl/sharedStrings.xml')
  const textos = leerTextosCompartidos(compartidos ? comoTexto(compartidos) : null)

  const hojas: HojaLeida[] = []
  let n = 0
  for (const h of comoTexto(libro).matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
    n += 1
    const nombre = atributo(h[1], 'name') ?? `Hoja ${n}`
    const idDeRelacion = atributo(h[1], 'id')
    // El destino viene relativo a `xl/` salvo que empiece por «/».
    const destino = idDeRelacion ? relaciones.get(idDeRelacion) : undefined
    const camino = destino ? (destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`) : `xl/worksheets/sheet${n}.xml`
    const xml = leerEntrada(datos, entradas, camino)
    if (!xml) continue
    hojas.push({ nombre, filas: leerHoja(comoTexto(xml), textos) })
  }
  if (hojas.length === 0) throw new PlanillaIlegible('La planilla no tiene ninguna hoja que se pueda leer.')
  return hojas
}
