import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORRECCIONES_DE_SISTEMA, corregirCatalogo } from '@/atlas/clasificacion'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'

/**
 * La plantilla que escribe `public/atlas/ATRIBUCION.md`.
 *
 * El archivo se corrigió a mano cuando el atlas empezó a enseñarse en español y
 * la plantilla de `scripts/atlas/preparar.mjs` se quedó con el texto antiguo.
 * Las pruebas del archivo pasaban, porque el archivo estaba bien; lo que habría
 * fallado era la próxima regeneración, que borraba sin aviso la declaración que
 * exige CC BY 4.0. Aquí se prueba la plantilla, y que lo que genera es lo que
 * hay escrito.
 *
 * Se importa con `import()` y un tipo escrito aquí porque es JavaScript sin
 * anotar: el tipo que TypeScript deduciría de él no dice nada.
 */

interface Plantilla {
  atribucion: (
    catalogo: CatalogoDelAtlas,
    tablas?: { correcciones?: Record<string, string>; traducciones?: Record<string, string> },
  ) => string
  aplicarCorrecciones: (
    catalogo: CatalogoDelAtlas,
    correcciones: Record<string, string>,
  ) => { catalogo: CatalogoDelAtlas; aplicadas: { nombre: string; de: string; a: string }[] }
  leerCorrecciones: () => Record<string, string>
}

const RAIZ = process.cwd()
const leer = (...partes: string[]) =>
  readFileSync(join(RAIZ, ...partes), 'utf8').replace(/\r\n/g, '\n')
const plantilla = () => import('../../scripts/atlas/atribucion.mjs') as unknown as Promise<Plantilla>

/** Todo en una línea: la página de créditos junta las líneas, y dónde se corta no es contenido. */
const plano = (texto: string) => texto.replace(/\s+/g, ' ').trim()

function pieza(
  id: string,
  nombre: string,
  sistema: string,
  origenRegion: PiezaDelAtlas['origenRegion'],
): PiezaDelAtlas {
  return {
    id,
    nombre,
    fma: `FMA-${id}`,
    sistema,
    region: 'miembro-inferior-derecho',
    origenRegion,
    paquete: 0,
    pos: 0,
    nor: 0,
    idx: 0,
    vertices: 0,
    indices: 0,
    caja: [
      [0, 0, 0],
      [0, 0, 0],
    ],
  }
}

/** Con el error del origen: el peroneo, estimado por su caja, metido en el esqueleto. */
const catalogoCrudo = (): CatalogoDelAtlas => ({
  version: 'prueba-atribucion',
  fuente: 'BodyParts3D 4.0',
  licencia: 'CC BY 4.0',
  sujeto: 'Prueba',
  triangulos: 1234,
  sistemas: [
    { id: 'skeletal', nombre: 'Esqueleto', color: '#eeeeee', orden: 1 },
    { id: 'muscular', nombre: 'Músculos', color: '#b6544c', orden: 2 },
    { id: 'arterial', nombre: 'Arterias', color: '#c2392f', orden: 3 },
  ],
  regiones: [{ id: 'miembro-inferior-derecho', nombre: 'Miembro inferior derecho', orden: 1 }],
  paquetes: [{ archivo: 'cuerpo-0.bin.gz', bytes: 1, bytesComprimido: 1 }],
  piezas: [
    pieza('p0', 'Right fibularis brevis', 'skeletal', 'caja'),
    pieza('p1', 'Right fibula', 'skeletal', 'caja'),
    pieza('p2', 'Right soleus', 'muscular', 'caja'),
    pieza('p3', 'Right anterior tibial artery', 'arterial', 'caja'),
  ],
})

const CORRECCION = { 'Right fibularis brevis': 'muscular' }

describe('la plantilla declara lo que la plataforma modifica', () => {
  it('ya no dice que los nombres se conservan en su forma original', async () => {
    const { atribucion } = await plantilla()
    const texto = plano(atribucion(catalogoCrudo(), { correcciones: CORRECCION, traducciones: {} }))
    expect(texto).not.toContain('se conservan en su forma original')
    expect(texto).toContain('- traducidos al español los nombres de los sistemas y de las regiones;')
    expect(texto).toContain('- traducidos al español, para enseñarlos, los nombres de las estructuras.')
    expect(texto).toContain(
      '- corregido el sistema anatómico de una estructura que el material original clasifica mal.',
    )
  })

  it('enumera cada corrección con su sistema de origen y de destino', async () => {
    const { atribucion } = await plantilla()
    const texto = plano(atribucion(catalogoCrudo(), { correcciones: CORRECCION, traducciones: {} }))
    expect(texto).toContain('La corrección de sistema es esta: - Right fibularis brevis: de esqueleto a músculos.')
  })

  it('pone al lado el nombre en español cuando la tabla lo tiene, en minúscula de frase', async () => {
    const { atribucion } = await plantilla()
    const texto = plano(
      atribucion(catalogoCrudo(), {
        correcciones: CORRECCION,
        traducciones: { 'Right fibularis brevis': 'Músculo peroneo corto derecho' },
      }),
    )
    expect(texto).toContain('- Right fibularis brevis (músculo peroneo corto derecho): de esqueleto a músculos.')
  })

  it('cuenta las regiones sobre el catálogo ya corregido', async () => {
    // Con el crudo diría «esqueleto (2 de 2)» y «músculos (1 de 1)»: el mismo
    // documento que declara el peroneo como músculo no lo contaría como tal.
    const { atribucion } = await plantilla()
    const texto = plano(atribucion(catalogoCrudo(), { correcciones: CORRECCION, traducciones: {} }))
    expect(texto).toContain('el resto es sobre todo músculos (2 de 2) y esqueleto (1 de 1).')
  })

  it('sin correcciones que cambien algo, no declara ninguna', async () => {
    const { atribucion } = await plantilla()
    const texto = plano(atribucion(catalogoCrudo(), { correcciones: {}, traducciones: {} }))
    expect(texto).not.toContain('corregido el sistema anatómico')
    expect(texto).not.toContain('correcci')
    // Y la viñeta de los nombres pasa a ser la última de la lista.
    expect(texto).toContain('sin traducirla a ciegas. La preparación intermedia')
  })
})

describe('una sola lista de correcciones', () => {
  it('la plantilla lee la misma que aplica la plataforma', async () => {
    const { leerCorrecciones } = await plantilla()
    expect(leerCorrecciones()).toEqual(CORRECCIONES_DE_SISTEMA)
  })

  it('y la aplica igual que corregirCatalogo', async () => {
    const { aplicarCorrecciones } = await plantilla()
    const crudo = catalogoCrudo()
    expect(aplicarCorrecciones(crudo, CORRECCIONES_DE_SISTEMA).catalogo.piezas).toEqual(
      corregirCatalogo(crudo).piezas,
    )
  })
})

describe('el ATRIBUCION.md de esta copia es el que genera la plantilla', () => {
  let real: CatalogoDelAtlas | null = null
  try {
    real = JSON.parse(leer('public', 'atlas', 'catalogo.json')) as CatalogoDelAtlas
  } catch {
    real = null
  }
  const siHay = real ? it : it.skip

  siHay('coincide palabra por palabra, salvo el nombre en español de cada corrección', async () => {
    // Si alguien vuelve a corregir el archivo a mano sin tocar la plantilla,
    // esto es lo que falla: sin esta prueba, la corrección duraría hasta la
    // próxima regeneración.
    //
    // Lo único que se tolera es el nombre en español entre paréntesis de cada
    // corrección, porque sale de `nombres-es.json`, que se está llenando: el
    // archivo lo trae escrito y la tabla puede no tenerlo todavía. Cuando lo
    // tenga, `node scripts/atlas/atribucion.mjs` reescribe el archivo y deja de
    // haber diferencia alguna.
    const { atribucion } = await plantilla()
    const sinTraduccion = (texto: string) => plano(texto).replace(/ \([^)]*\)(?=: de )/g, '')

    const escrito = leer('public', 'atlas', 'ATRIBUCION.md')
    const generado = atribucion(real!)
    expect(sinTraduccion(escrito)).toBe(sinTraduccion(generado))

    // Y la tolerancia no se come nada más: todas las correcciones siguen ahí.
    for (const nombre of Object.keys(CORRECCIONES_DE_SISTEMA)) {
      expect(sinTraduccion(escrito)).toContain(`- ${nombre}: de esqueleto a `)
    }
  })
})

describe('quien escribe el ATRIBUCION.md usa la plantilla', () => {
  const preparar = leer('scripts', 'atlas', 'preparar.mjs')

  /*
   * Estuvo marcada con `it.fails` mientras `scripts/atlas/preparar.mjs` traía su
   * propia plantilla con el texto antiguo —«los nombres se conservan en su forma
   * original»—, para que no se pudiera olvidar en ninguna de las dos
   * direcciones. Ya está cableado: el guion importa la plantilla y no redacta
   * otra. Si esta prueba vuelve a fallar, alguien ha devuelto una segunda
   * plantilla al guion, y la declaración de cambios que exige la licencia volverá
   * a mentir la próxima vez que se regenere el atlas.
   */
  it('preparar.mjs importa atribucion.mjs y no redacta otra plantilla', () => {
    expect(preparar).toMatch(/import \{[^}]*\batribucion\b[^}]*\} from '\.\/atribucion\.mjs'/)
    expect(preparar).not.toMatch(/function atribucion\(/)
    expect(preparar).not.toMatch(/function resumenDeRegiones\(/)
    expect(preparar).not.toContain('se conservan en su forma original')
  })
})
