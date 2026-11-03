import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios } from '@/access/payload'
import { espacioDeTexto, normalizarTexto, problemaDelTexto } from '@/lib/espaciosDeLaPagina'

/**
 * Los textos de las páginas públicas que el administrador cambió (P-007 E2).
 *
 * Una fila por texto **cambiado**, nunca por texto: el original vive en
 * `src/lib/espaciosDeLaPagina.ts` y aquí solo se guarda lo que se aparta de él.
 * Restaurar es borrar la fila. Así un original corregido en el código llega a
 * la página en el siguiente despliegue a menos que el administrador lo haya
 * reescrito, y en ese caso manda lo suyo, que es lo que eligió.
 *
 * `espacio` no es único en la base, a sabiendas: la acción que guarda busca la
 * fila del espacio y la reescribe, y la lectura se queda con la más reciente si
 * dos administradores guardaran a la vez. Un índice único convertiría ese
 * choque en un error de PostgreSQL en inglés.
 */
export const TextosPagina: CollectionConfig = {
  slug: 'textos-pagina',
  labels: { singular: 'Texto de la página', plural: 'Textos de la página' },
  admin: { useAsTitle: 'espacio', group: 'Administración' },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
  },
  fields: [
    {
      name: 'espacio',
      type: 'text',
      required: true,
      index: true,
      label: 'Espacio de la página',
      // Texto y no `select`, por lo mismo que en `medios-pagina`.
      validate: (valor: unknown) => (espacioDeTexto(valor) ? true : 'Ese espacio de la página no existe.'),
    },
    {
      name: 'texto',
      type: 'textarea',
      label: 'Texto',
      hooks: {
        // Se guarda ya normalizado, para que lo que valida la regla de abajo
        // sea lo mismo que se pinta.
        beforeValidate: [
          ({ value, siblingData }) => {
            const espacio = espacioDeTexto((siblingData as Record<string, unknown> | undefined)?.espacio)
            return espacio && typeof value === 'string' ? normalizarTexto(espacio, value) : value
          },
        ],
      },
      // La misma regla que comprueba la acción antes de escribir. Está también
      // aquí porque la API REST de Payload es otra puerta a la misma tabla, y
      // por esa no pasa la acción.
      validate: (valor: unknown, { siblingData }: { siblingData: Partial<Record<string, unknown>> }) => {
        const espacio = espacioDeTexto(siblingData?.espacio)
        if (!espacio) return true
        if (valor !== null && valor !== undefined && typeof valor !== 'string') return 'El texto no es válido.'
        return problemaDelTexto(espacio, typeof valor === 'string' ? valor : '') ?? true
      },
    },
  ],
}
