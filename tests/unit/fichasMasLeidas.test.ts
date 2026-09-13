import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { COLECCIONES, SLUGS_DE_MODULOS } from '@/collections'
import { ESQUEMAS } from '@/admin/esquema'
import {
  fichasConMasLecturas,
  modulosConTitulosIlegibles,
  rotularFichasLeidas,
} from '@/app/(frontend)/admin-panel/estadisticas/fichasMasLeidas'
import {
  claveDeFicha,
  leerTitulosDeFichas,
  type EstadoDeFicha,
} from '@/app/(frontend)/admin-panel/titulosDeFichas'

/**
 * «Fichas más leídas» con el título de cada ficha.
 *
 * La tarjeta rotulaba sus barras con el número de fila —«Biblioteca de
 * patologías · #12»—, y la única pregunta que responde es qué se está leyendo.
 * Lo que aquí se fija son las tres piezas que lo arreglan y, sobre todo, que la
 * página las llama: la función que rotula existía en otras dos pantallas escrita
 * a mano, y el patrón que más ha fallado en esta casa es la función correcta a
 * la que nadie llama.
 */

const fila = (coleccion: string, documentoId: string | number) => ({ coleccion, documentoId })

describe('qué fichas entran', () => {
  it('cuenta por ficha, ordena de más a menos y corta', () => {
    const registros = [
      fila('patologias', '1'),
      fila('casos-ao', '1'),
      fila('patologias', '1'),
      fila('patologias', '2'),
      fila('patologias', '1'),
      fila('casos-ao', '1'),
    ]
    expect(fichasConMasLecturas(registros, 2)).toEqual([
      { coleccion: 'patologias', documentoId: '1', lecturas: 3 },
      // El mismo número en dos módulos son dos fichas distintas.
      { coleccion: 'casos-ao', documentoId: '1', lecturas: 2 },
    ])
  })

  it('a igualdad, conserva el orden en que llegaron las filas', () => {
    // La página pide `actividad` por `ultimaVisita` descendente: entre dos
    // empatadas, la leída más recientemente va antes.
    const registros = [fila('maniobras', '9'), fila('cirugias', '3')]
    expect(fichasConMasLecturas(registros, 8).map((f) => f.documentoId)).toEqual(['9', '3'])
  })

  it('descarta la fila que no dice a qué ficha apunta', () => {
    const registros = [
      { coleccion: 'patologias' },
      { documentoId: '4' },
      fila('', '4'),
      fila('patologias', ''),
      fila('patologias', 4),
    ]
    expect(fichasConMasLecturas(registros as never, 8)).toEqual([
      { coleccion: 'patologias', documentoId: '4', lecturas: 1 },
    ])
  })
})

describe('de dónde sale el título', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cada módulo declara en su esquema un campo de nombre que la colección tiene', () => {
    // Si el esquema de un módulo nombra un campo que no existe, todas sus
    // fichas saldrían «Sin título» sin que nada falle.
    for (const slug of SLUGS_DE_MODULOS) {
      const campo = ESQUEMAS.find((e) => e.slug === slug)?.titulo
      expect(campo, slug).toBeTruthy()
      const coleccion = COLECCIONES.find((c) => c.slug === slug)
      const nombres = (coleccion?.fields ?? []).map((f) => ('name' in f ? f.name : undefined))
      expect(nombres, slug).toContain(campo)
    }
  })

  it('una consulta por colección, con el campo de nombre de cada una', async () => {
    const buscar = vi.fn(async (args: { collection: string; where: unknown }) => {
      if (args.collection === 'patologias') {
        return { docs: [{ id: 1, nombre: '  Fractura de radio distal ' }, { id: 2, nombre: '' }] }
      }
      return { docs: [{ id: 5, titulo: 'Fractura de tibia 42-A1' }] }
    })
    const payload = { find: buscar } as unknown as Payload

    const estados = await leerTitulosDeFichas(payload, [
      { coleccion: 'patologias', documentoId: '1' },
      { coleccion: 'patologias', documentoId: '2' },
      { coleccion: 'patologias', documentoId: '3' },
      { coleccion: 'casos-ao', documentoId: '5' },
    ])

    expect(buscar).toHaveBeenCalledTimes(2)
    expect(buscar.mock.calls.map(([a]) => a.collection).sort()).toEqual(['casos-ao', 'patologias'])
    expect(estados.get(claveDeFicha('patologias', '1'))).toEqual({
      tipo: 'titulo',
      titulo: 'Fractura de radio distal',
    })
    expect(estados.get(claveDeFicha('patologias', '2'))).toEqual({ tipo: 'sinTitulo' })
    // Pedida y no devuelta: se borró, y sus lecturas siguen en `actividad`.
    expect(estados.get(claveDeFicha('patologias', '3'))).toEqual({ tipo: 'eliminada' })
    // Técnica AO se llama por `titulo`, no por `nombre`.
    expect(estados.get(claveDeFicha('casos-ao', '5'))).toEqual({
      tipo: 'titulo',
      titulo: 'Fractura de tibia 42-A1',
    })
  })

  it('una colección que falla deja sus fichas ilegibles, no eliminadas, y lo anota', async () => {
    const payload = {
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'cirugias') throw new Error('relation "cirugias" does not exist')
        return { docs: [{ id: 1, nombre: 'Maniobra de Lachman' }] }
      }),
    } as unknown as Payload

    const estados = await leerTitulosDeFichas(payload, [
      { coleccion: 'cirugias', documentoId: '7' },
      { coleccion: 'maniobras', documentoId: '1' },
    ])

    expect(estados.get(claveDeFicha('cirugias', '7'))).toEqual({ tipo: 'ilegible' })
    expect(estados.get(claveDeFicha('maniobras', '1'))).toEqual({
      tipo: 'titulo',
      titulo: 'Maniobra de Lachman',
    })
    expect(console.error).toHaveBeenCalled()
  })

  it('a una colección que ya no existe no se le pregunta', async () => {
    const buscar = vi.fn()
    const estados = await leerTitulosDeFichas({ find: buscar } as unknown as Payload, [
      { coleccion: 'modulo-retirado', documentoId: '1' },
    ])
    expect(buscar).not.toHaveBeenCalled()
    expect(estados.get(claveDeFicha('modulo-retirado', '1'))).toEqual({ tipo: 'eliminada' })
  })

  it('sin fichas, sin consultas', async () => {
    const buscar = vi.fn()
    await leerTitulosDeFichas({ find: buscar } as unknown as Payload, [])
    expect(buscar).not.toHaveBeenCalled()
  })
})

describe('cómo se rotulan', () => {
  const estados = (pares: [string, string, EstadoDeFicha][]) =>
    new Map(pares.map(([c, d, e]) => [claveDeFicha(c, d), e] as const))

  it('con el título delante y el módulo detrás, y sin número de fila', () => {
    const fichas = [{ coleccion: 'patologias', documentoId: '12', lecturas: 4 }]
    const barras = rotularFichasLeidas(
      fichas,
      estados([['patologias', '12', { tipo: 'titulo', titulo: 'Fractura de escafoides' }]]),
    )
    expect(barras).toEqual([
      { etiqueta: 'Fractura de escafoides · Biblioteca de patologías', valor: 4 },
    ])
    // Lo que había antes.
    expect(barras[0].etiqueta).not.toContain('#12')
  })

  it('dos fichas con el mismo título en el mismo módulo llevan su número, y no se pisan', () => {
    const fichas = [
      { coleccion: 'patologias', documentoId: '3', lecturas: 5 },
      { coleccion: 'patologias', documentoId: '8', lecturas: 2 },
      { coleccion: 'casos-ao', documentoId: '1', lecturas: 1 },
    ]
    const barras = rotularFichasLeidas(
      fichas,
      estados([
        ['patologias', '3', { tipo: 'titulo', titulo: 'Luxación de hombro' }],
        ['patologias', '8', { tipo: 'titulo', titulo: 'Luxación de hombro' }],
        ['casos-ao', '1', { tipo: 'titulo', titulo: 'Luxación de hombro' }],
      ]),
    )
    const etiquetas = barras.map((b) => b.etiqueta)
    // `BarrasHorizontales` usa la etiqueta como `key`.
    expect(new Set(etiquetas).size).toBe(etiquetas.length)
    expect(etiquetas).toEqual([
      'Luxación de hombro (#3) · Biblioteca de patologías',
      'Luxación de hombro (#8) · Biblioteca de patologías',
      // En otro módulo el módulo ya las distingue.
      'Luxación de hombro · Técnica AO',
    ])
  })

  it('sin título, dice por qué, y nunca con la forma de antes', () => {
    const fichas = [
      { coleccion: 'maniobras', documentoId: '1', lecturas: 3 },
      { coleccion: 'maniobras', documentoId: '2', lecturas: 2 },
      { coleccion: 'cirugias', documentoId: '3', lecturas: 1 },
      { coleccion: 'estudios-ia', documentoId: '4', lecturas: 1 },
    ]
    const barras = rotularFichasLeidas(
      fichas,
      estados([
        ['maniobras', '1', { tipo: 'sinTitulo' }],
        ['maniobras', '2', { tipo: 'eliminada' }],
        ['cirugias', '3', { tipo: 'ilegible' }],
        // La de estudios no se buscó: se trata como ilegible.
      ]),
    )
    expect(barras.map((b) => b.etiqueta)).toEqual([
      'Sin título (#1) · Examen físico',
      'Ficha eliminada (#2) · Examen físico',
      'Título no disponible (#3) · Simulador quirúrgico',
      'Título no disponible (#4) · Lectura de imágenes',
    ])
    for (const barra of barras) {
      expect(barra.etiqueta).not.toMatch(/^[^(]+ · #\d+$/)
    }
  })

  it('nombra para el aviso los módulos cuyos títulos no se pudieron leer, una vez', () => {
    const fichas = [
      { coleccion: 'cirugias', documentoId: '1', lecturas: 3 },
      { coleccion: 'cirugias', documentoId: '2', lecturas: 2 },
      { coleccion: 'patologias', documentoId: '1', lecturas: 1 },
    ]
    const nombres = modulosConTitulosIlegibles(
      fichas,
      estados([
        ['cirugias', '1', { tipo: 'ilegible' }],
        ['cirugias', '2', { tipo: 'ilegible' }],
        ['patologias', '1', { tipo: 'eliminada' }],
      ]),
    )
    expect(nombres).toEqual(['Simulador quirúrgico'])
  })
})

describe('la página de estadísticas lo usa', () => {
  const codigo = readFileSync(
    join(process.cwd(), 'src', 'app', '(frontend)', 'admin-panel', 'estadisticas', 'page.tsx'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')

  it('cuenta, busca los títulos de esas y rotula con ellos', () => {
    expect(codigo).toContain('fichasConMasLecturas(actividad, 8)')
    expect(codigo).toContain('await leerTitulosDeFichas(payload, masLeidas)')
    expect(codigo).toContain('rotularFichasLeidas(masLeidas, estadosDeLasMasLeidas)')
    expect(codigo).toContain('<BarrasHorizontales titulo="Fichas más leídas" datos={fichasMasLeidas} />')
  })

  it('lleva al aviso de arriba los títulos que no se pudieron leer', () => {
    expect(codigo).toContain('modulosConTitulosIlegibles(masLeidas, estadosDeLasMasLeidas)')
  })

  it('no vuelve a rotular con el número de fila', () => {
    expect(codigo).not.toMatch(/· #\$\{/)
  })
})
