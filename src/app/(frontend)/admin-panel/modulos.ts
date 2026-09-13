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
 * Dos excepciones, y las dos vienen de que el panel habla de colecciones y el
 * residente de módulos:
 *
 * - La biblioteca: su colección se llama «patologias» pero vive en
 *   `/biblioteca`, porque para el residente es la biblioteca.
 * - El examen físico: es el único de los cinco sin página por documento. Las
 *   maniobras se pintan todas juntas en el listado, agrupadas por segmento.
 */
export const rutaPublica = (coleccion: string, id: string | number): string => {
  const modulo = MODULOS.find((m) => m.slug === coleccion)
  if (!modulo) return '/'
  // Componer `/examen-fisico/<id>` como en los otros cuatro módulos daba un
  // 404 de Next —no existe `examen-fisico/[id]/`— justo en los dos sitios en
  // los que se pulsa: «Ver publicado ↗» después de publicar una maniobra, y
  // «abrir ficha →» sobre un comentario. Como el contenido sí se había
  // publicado, lo razonable era concluir que la publicación había fallado.
  // El ancla lleva al listado aunque el `<article>` todavía no la declare; si
  // algún día hay ficha por maniobra, esta línea es la que se quita.
  if (modulo.slug === 'maniobras') return `${modulo.ruta}#maniobra-${id}`
  return `${modulo.ruta}/${id}`
}
