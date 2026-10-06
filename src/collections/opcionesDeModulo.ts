/**
 * Los cinco módulos, tal como se ofrecen en un `select`: al asignar permisos a
 * una cuenta y al poner un módulo en mantención.
 *
 * Estaba escrita dentro de `Usuarios.ts`. Con una segunda colección que la
 * necesita se mudó aquí, porque dos copias de esta lista es lo que el resto del
 * proyecto evita (ver `SLUGS_DE_MODULOS`): el módulo que falte en una de las
 * dos es una casilla que no aparece y que nadie echa de menos hasta que hace
 * falta.
 */
export const OPCIONES_DE_MODULO = [
  { label: 'Biblioteca de patologías', value: 'patologias' },
  { label: 'Examen físico', value: 'maniobras' },
  { label: 'Técnica AO', value: 'casos-ao' },
  { label: 'Simulador quirúrgico', value: 'cirugias' },
  { label: 'Lectura de imágenes', value: 'estudios-ia' },
]
