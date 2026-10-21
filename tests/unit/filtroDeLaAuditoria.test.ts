import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { filasQueCoinciden } from '@/lib/auditoria'

/** El buscador de fichas de la pestaña Auditoría, con selección que sobrevive a la búsqueda. */

const fila = (titulo: string, extra: Partial<{ coleccion: string; libro: string; capitulo: string; asignada: string }> = {}) => ({
  titulo,
  coleccion: 'patologias',
  libro: '',
  capitulo: '',
  asignada: '',
  ...extra,
})

const FILAS = [
  fila('Fractura de pilón tibial', { libro: 'Rockwood', capitulo: '12', asignada: 'Ana Soto' }),
  fila('Fractura de diáfisis de fémur', { asignada: 'Luis Peña' }),
  fila('Luxación de hombro', { coleccion: 'maniobras' }),
  fila('Año nuevo en urgencias'),
]
const nombre = (c: string) => (c === 'maniobras' ? 'Maniobras' : 'Patologías')

describe('filasQueCoinciden', () => {
  it('sin texto devuelve todas', () => {
    expect(filasQueCoinciden(FILAS, '')).toHaveLength(4)
    expect(filasQueCoinciden(FILAS, '   ')).toHaveLength(4)
  })

  it('busca sin mirar tildes ni mayúsculas', () => {
    expect(filasQueCoinciden(FILAS, 'PILON').map((f) => f.titulo)).toEqual(['Fractura de pilón tibial'])
    expect(filasQueCoinciden(FILAS, 'luxacion').map((f) => f.titulo)).toEqual(['Luxación de hombro'])
  })

  it('todas las palabras, en cualquier orden', () => {
    expect(filasQueCoinciden(FILAS, 'tibial pilon fractura')).toHaveLength(1)
    expect(filasQueCoinciden(FILAS, 'fractura')).toHaveLength(2)
    expect(filasQueCoinciden(FILAS, 'fractura hombro')).toHaveLength(0)
  })

  it('también por módulo, libro, capítulo y persona asignada', () => {
    expect(filasQueCoinciden(FILAS, 'maniobras', nombre).map((f) => f.titulo)).toEqual(['Luxación de hombro'])
    expect(filasQueCoinciden(FILAS, 'rockwood').map((f) => f.titulo)).toEqual(['Fractura de pilón tibial'])
    expect(filasQueCoinciden(FILAS, 'luis').map((f) => f.titulo)).toEqual(['Fractura de diáfisis de fémur'])
  })

  it('la eñe no se confunde con la ene', () => {
    expect(filasQueCoinciden(FILAS, 'año')).toHaveLength(1)
    expect(filasQueCoinciden(FILAS, 'ano')).toHaveLength(0)
  })
})

describe('el cableado del buscador de la auditoría', () => {
  const tabla = readFileSync(join(process.cwd(), 'src/app/(frontend)/admin-panel/auditoria/TablaDeAuditoria.tsx'), 'utf8')

  it('lo elegido se saca de todas las filas y no de las visibles: sobrevive a cambiar la búsqueda', () => {
    expect(tabla).toContain('const seleccion = ordenadas.filter((f) => elegidas.has(clave(f)))')
    expect(tabla).toContain('fuera de la búsqueda')
  })

  it('«elegir todas» solo mueve lo que se ve y conserva el resto', () => {
    expect(tabla).toContain('for (const f of visibles)')
  })

  it('la tabla pinta las visibles', () => {
    expect(tabla).toContain('{visibles.map((f) => (')
  })
})
