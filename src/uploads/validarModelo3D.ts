/**
 * Validación de modelos tridimensionales subidos a la plataforma.
 *
 * Dos principios: el tipo de archivo se determina por su contenido y no por su
 * extensión, y el peso se limita a lo que un navegador modesto puede cargar
 * (observación O-008). Los modelos provienen de segmentaciones de TC y RM
 * (decisión D-022), donde la malla cruda pesa cientos de megabytes; ese trabajo
 * de reducción ocurre antes de la subida y este límite lo hace cumplir.
 */

/** Techo de 5 MB: por encima, la plataforma deja de abrirse en equipos modestos. */
export const LIMITE_BYTES_MODELO_3D = 5 * 1024 * 1024

const EXTENSIONES = ['.glb', '.gltf']

/** "glTF" en ASCII, la firma de un glTF binario. */
const FIRMA_GLTF = 0x676c5446
const VERSION_SOPORTADA = 2

export interface EntradaModelo3D {
  nombre: string
  contenido: Buffer
  /** Peso real del archivo. Si se omite, se usa el largo del contenido. */
  bytes?: number
}

export interface ResultadoValidacion {
  valido: boolean
  motivo?: string
  nombreSeguro?: string
}

/**
 * Reduce un nombre de archivo a algo que no pueda escapar del directorio de
 * subidas ni interpretarse como ruta.
 */
export function nombreSeguroDeArchivo(nombre: string): string {
  const partes = nombre
    .split(/[\/]+/)
    .filter((p) => p !== '' && p !== '.' && p !== '..')
  return partes
    .join('-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
}

export function validarModelo3D(entrada: EntradaModelo3D): ResultadoValidacion {
  const { nombre, contenido } = entrada
  const bytes = entrada.bytes ?? contenido.length

  const extension = nombre.slice(nombre.lastIndexOf('.')).toLowerCase()
  if (!EXTENSIONES.includes(extension)) {
    return { valido: false, motivo: `Extensión no admitida: se esperaba ${EXTENSIONES.join(' o ')}.` }
  }

  if (bytes > LIMITE_BYTES_MODELO_3D) {
    const mb = (LIMITE_BYTES_MODELO_3D / 1024 / 1024).toFixed(0)
    return { valido: false, motivo: `Tamaño excesivo: el límite servible en navegador es de ${mb} MB.` }
  }

  // La cabecera de un glTF binario ocupa 12 bytes: firma, versión y longitud.
  if (contenido.length < 12) {
    return { valido: false, motivo: 'Contenido demasiado corto para ser un modelo válido.' }
  }

  if (contenido.readUInt32BE(0) !== FIRMA_GLTF) {
    return { valido: false, motivo: 'El contenido del archivo no corresponde a un modelo glTF.' }
  }

  const version = contenido.readUInt32LE(4)
  if (version !== VERSION_SOPORTADA) {
    return { valido: false, motivo: `Versión de glTF no soportada por el visor: ${version}.` }
  }

  return { valido: true, nombreSeguro: nombreSeguroDeArchivo(nombre) }
}
