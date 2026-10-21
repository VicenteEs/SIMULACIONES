/**
 * Metadatos dentro de un PNG (P-004 E11), sin bibliotecas.
 *
 * Un PNG es una firma de ocho bytes y una cadena de bloques (longitud, tipo, datos, CRC). Los bloques `tEXt` llevan pares
 * «palabra clave / texto» y los visores y `exiftool` los leen sin más: el cirujano, el diagnóstico y la fecha viajan con la
 * lámina aunque alguien la renombre o la pegue en otra parte. Se insertan **antes del primer `IDAT`**, que es donde la
 * especificación los admite y donde cualquier lector los espera.
 *
 * `tEXt` es Latin-1 (los acentos y la ñ caben; el resto no). Lo que no cabe se cambia por «?» en lugar de mentir con bytes
 * inválidos: un nombre con un carácter raro sale con un signo, no con un PNG que un lector rechaza.
 */

const FIRMA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

let tablaDeCrc: Uint32Array | null = null

/** El CRC-32 de la especificación PNG (polinomio 0xEDB88320), con la tabla calculada la primera vez que se pide. */
export function crc32(bytes: Uint8Array): number {
  if (!tablaDeCrc) {
    tablaDeCrc = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      tablaDeCrc[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = tablaDeCrc[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const aLatin1 = (texto: string): Uint8Array => {
  const salida = new Uint8Array(texto.length)
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    salida[i] = c < 256 ? c : 0x3f
  }
  return salida
}

const deLatin1 = (bytes: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

/** La palabra clave de un `tEXt` mide de 1 a 79 caracteres Latin-1 imprimibles y no empieza ni termina en espacio. */
function palabraClaveValida(clave: string): string {
  const limpia = clave.replace(/[^\x20-\x7e\xa1-\xff]/g, '?').trim().slice(0, 79)
  return limpia || 'Comment'
}

function bloque(tipo: string, datos: Uint8Array): Uint8Array {
  const salida = new Uint8Array(12 + datos.length)
  const vista = new DataView(salida.buffer)
  vista.setUint32(0, datos.length)
  for (let i = 0; i < 4; i++) salida[4 + i] = tipo.charCodeAt(i)
  salida.set(datos, 8)
  vista.setUint32(8 + datos.length, crc32(salida.subarray(4, 8 + datos.length)))
  return salida
}

function bloqueTexto(clave: string, texto: string): Uint8Array {
  const k = aLatin1(palabraClaveValida(clave))
  // Dentro del texto se admiten saltos de línea (0x0A) pero no el cero, que acabaría la cadena.
  const t = aLatin1(texto.replace(/\u0000/g, ''))
  const datos = new Uint8Array(k.length + 1 + t.length)
  datos.set(k, 0)
  datos[k.length] = 0
  datos.set(t, k.length + 1)
  return bloque('tEXt', datos)
}

/** `true` si empieza con la firma de un PNG. */
export const esUnPng = (bytes: Uint8Array): boolean => FIRMA.every((b, i) => bytes[i] === b)

/**
 * Devuelve el mismo PNG con los textos añadidos como bloques `tEXt` justo antes del primer `IDAT`.
 * Lanza si lo recibido no es un PNG: callar y devolverlo igual dejaría una lámina sin la metadata que se prometió.
 */
export function pngConTextos(png: Uint8Array, textos: Readonly<Record<string, string>>): Uint8Array {
  if (!esUnPng(png)) throw new Error('No es un PNG: falta la firma.')
  const vista = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let posicion = FIRMA.length
  let puntoDeInsercion = -1
  while (posicion + 8 <= png.length) {
    const longitud = vista.getUint32(posicion)
    const tipo = deLatin1(png.subarray(posicion + 4, posicion + 8))
    if (tipo === 'IDAT') {
      puntoDeInsercion = posicion
      break
    }
    posicion += 12 + longitud
  }
  if (puntoDeInsercion < 0) throw new Error('El PNG no tiene datos de imagen (IDAT).')
  const nuevos = Object.entries(textos)
    .filter(([, texto]) => texto.trim() !== '')
    .map(([clave, texto]) => bloqueTexto(clave, texto))
  const largo = nuevos.reduce((s, b) => s + b.length, 0)
  const salida = new Uint8Array(png.length + largo)
  salida.set(png.subarray(0, puntoDeInsercion), 0)
  let desde = puntoDeInsercion
  for (const b of nuevos) {
    salida.set(b, desde)
    desde += b.length
  }
  salida.set(png.subarray(puntoDeInsercion), desde)
  return salida
}

/** Lee de vuelta los `tEXt` de un PNG, verificando el CRC de cada uno: lo que la prueba necesita para comprobar que la metadata quedó. */
export function textosDelPng(png: Uint8Array): Record<string, string> {
  if (!esUnPng(png)) throw new Error('No es un PNG: falta la firma.')
  const vista = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const salida: Record<string, string> = {}
  let posicion = FIRMA.length
  while (posicion + 12 <= png.length) {
    const longitud = vista.getUint32(posicion)
    const tipo = deLatin1(png.subarray(posicion + 4, posicion + 8))
    const datos = png.subarray(posicion + 8, posicion + 8 + longitud)
    if (tipo === 'tEXt') {
      const esperado = vista.getUint32(posicion + 8 + longitud)
      if (crc32(png.subarray(posicion + 4, posicion + 8 + longitud)) !== esperado) throw new Error('Un bloque tEXt tiene el CRC mal.')
      const cero = datos.indexOf(0)
      if (cero > 0) salida[deLatin1(datos.subarray(0, cero))] = deLatin1(datos.subarray(cero + 1))
    }
    if (tipo === 'IEND') break
    posicion += 12 + longitud
  }
  return salida
}

/** Un `data:` URL de un lienzo → sus bytes. */
export function bytesDeUnDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}
