/**
 * Los módulos que la plataforma anuncia y todavía no tiene (D-163, E7).
 *
 * No son un módulo de verdad, y por eso **no están en `SLUGS_DE_MODULOS`**: esa
 * lista manda en los permisos de cada cuenta, en los enumerados de la base, en la
 * barra, en el seguimiento de lectura y en cinco copias más, y un módulo sin
 * contenido no tiene nada que proteger ni que contar. Aquí viven aparte, con lo
 * justo para dibujar su tarjeta y llevar a su página.
 *
 * Sin Payload ni Next: la portada pública lo importa.
 */

export interface ModuloAnunciado {
  numero: string
  slug: 'planificacion'
  nombre: string
  ruta: '/planificacion'
  resumen: string
  estado: 'proximamente'
}

export const MODULOS_ANUNCIADOS: readonly ModuloAnunciado[] = [
  {
    numero: '06',
    slug: 'planificacion',
    nombre: 'Planificación con imágenes del paciente',
    ruta: '/planificacion',
    resumen:
      'Cargar una tomografía, reconstruir la fractura y planificar la cirugía sobre ella. En camino: hoy se reúnen los requisitos.',
    estado: 'proximamente',
  },
]

/** El texto de la insignia, el mismo en la portada y en la página. */
export const ROTULO_PROXIMAMENTE = 'Próximamente'
