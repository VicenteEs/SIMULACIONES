/**
 * Un archivo ZIP, escrito a mano (D-143).
 *
 * Una planilla de Excel (`.xlsx`) es un ZIP con XML dentro, y es lo único para
 * lo que la plataforma lo necesita. Las bibliotecas que lo hacen traen consigo
 * lectores, fórmulas, gráficos y estilos —la más conocida pesa varios megas y
 * su versión de npm lleva años sin parches—, y lo que aquí hace falta cabe en
 * una página: cabeceras locales, el directorio central y un CRC-32. Se
 * comprime con el `deflateRawSync` de Node, que es el mismo DEFLATE que pide
 * el formato.
 *
 * Solo de servidor: `node:zlib` no existe en el navegador.
 */
import { deflateRawSync } from 'node:zlib'

export interface ArchivoDelZip {
  nombre: string
  datos: Uint8Array | string
}

/** La tabla del CRC-32 (polinomio 0xEDB88320), calculada una vez. */
const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  return tabla
})()

/** El CRC-32 de unos bytes, el que exige cada entrada del ZIP. */
export function crc32(datos: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < datos.length; i += 1) crc = TABLA_CRC[(crc ^ datos[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Fecha y hora en el formato de MS-DOS que guarda el ZIP (con resolución de dos segundos). */
function fechaDos(fecha: Date): { hora: number; dia: number } {
  const anio = Math.min(Math.max(fecha.getFullYear(), 1980), 2107)
  return {
    hora: (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2),
    dia: ((anio - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate(),
  }
}

/** Arma el ZIP con los archivos dados, en ese orden. */
export function crearZip(archivos: readonly ArchivoDelZip[], fecha: Date = new Date()): Uint8Array {
  const codificador = new TextEncoder()
  const { hora, dia } = fechaDos(fecha)
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let desplazamiento = 0

  for (const archivo of archivos) {
    const nombre = codificador.encode(archivo.nombre)
    const crudos = typeof archivo.datos === 'string' ? codificador.encode(archivo.datos) : archivo.datos
    const comprimidos = new Uint8Array(deflateRawSync(crudos, { level: 9 }))
    const crc = crc32(crudos)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // versión necesaria: 2.0 (DEFLATE)
    local.setUint16(6, 0x0800, true) // nombres en UTF-8
    local.setUint16(8, 8, true) // DEFLATE
    local.setUint16(10, hora, true)
    local.setUint16(12, dia, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, comprimidos.length, true)
    local.setUint32(22, crudos.length, true)
    local.setUint16(26, nombre.length, true)
    local.setUint16(28, 0, true)
    partes.push(new Uint8Array(local.buffer), nombre, comprimidos)

    const entrada = new DataView(new ArrayBuffer(46))
    entrada.setUint32(0, 0x02014b50, true)
    entrada.setUint16(4, 20, true) // hecha por: 2.0
    entrada.setUint16(6, 20, true)
    entrada.setUint16(8, 0x0800, true)
    entrada.setUint16(10, 8, true)
    entrada.setUint16(12, hora, true)
    entrada.setUint16(14, dia, true)
    entrada.setUint32(16, crc, true)
    entrada.setUint32(20, comprimidos.length, true)
    entrada.setUint32(24, crudos.length, true)
    entrada.setUint16(28, nombre.length, true)
    entrada.setUint16(30, 0, true)
    entrada.setUint16(32, 0, true)
    entrada.setUint16(34, 0, true)
    entrada.setUint16(36, 0, true)
    entrada.setUint32(38, 0, true)
    entrada.setUint32(42, desplazamiento, true)
    central.push(new Uint8Array(entrada.buffer), nombre)

    desplazamiento += 30 + nombre.length + comprimidos.length
  }

  const tamanoCentral = central.reduce((total, parte) => total + parte.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true)
  fin.setUint16(4, 0, true)
  fin.setUint16(6, 0, true)
  fin.setUint16(8, archivos.length, true)
  fin.setUint16(10, archivos.length, true)
  fin.setUint32(12, tamanoCentral, true)
  fin.setUint32(16, desplazamiento, true)
  fin.setUint16(20, 0, true)

  const todo = [...partes, ...central, new Uint8Array(fin.buffer)]
  const salida = new Uint8Array(todo.reduce((total, parte) => total + parte.length, 0))
  let posicion = 0
  for (const parte of todo) {
    salida.set(parte, posicion)
    posicion += parte.length
  }
  return salida
}
