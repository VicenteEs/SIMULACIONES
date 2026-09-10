/**
 * Nombres y rutas de los módulos, sin nada del servidor.
 *
 * Está separado de `datos.ts` a propósito: aquel importa Payload y su
 * configuración, de modo que un componente de cliente que quisiera solo el
 * nombre legible de un módulo arrastraría el servidor entero al paquete del
 * navegador. Aquí no hay más que constantes y una función pura.
 */

export const MODULOS = [
  { slug: 'patologias', nombre: 'Biblioteca de patologías', ruta: '/biblioteca', numero: '01' },
  { slug: 'maniobras', nombre: 'Examen físico', ruta: '/examen-fisico', numero: '02' },
  { slug: 'casos-ao', nombre: 'Técnica AO', ruta: '/tecnica-ao', numero: '03' },
  { slug: 'cirugias', nombre: 'Simulador quirúrgico', ruta: '/simulador', numero: '04' },
  { slug: 'estudios-ia', nombre: 'Lectura de imágenes', ruta: '/imagenes', numero: '05' },
] as const

/** Nombre legible de cada módulo, para mostrar un slug guardado en la base. */
export const NOMBRE_DE_MODULO: Record<string, string> = Object.fromEntries(
  MODULOS.map((m) => [m.slug, m.nombre]),
)

/**
 * Ruta pública de una ficha, para saltar desde el panel a lo que se comenta.
 *
 * La biblioteca es la excepción: su módulo se llama «patologias» pero vive en
 * `/biblioteca`, porque para el residente es la biblioteca y no la colección.
 */
export const rutaPublica = (coleccion: string, id: string | number): string => {
  const modulo = MODULOS.find((m) => m.slug === coleccion)
  if (!modulo) return '/'
  return `${modulo.ruta}/${id}`
}
