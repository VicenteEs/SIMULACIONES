// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, StrictMode, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Campo } from '@/admin/esquema'
import type { Respuesta } from '@/lib/guardias'
import {
  CLAVE_DE_FILA,
  claveDe,
  claveEstable,
  clavesQueRecibieronId,
  conCampoEnElBloque,
  escritorPorClave,
  nuevaClave,
  type Fila,
} from '@/admin/identidadDeBloques'

/**
 * Plegar un bloque, moverlo o guardar la ficha mientras sube su archivo no
 * deja el archivo sin elegir.
 *
 * El editor de bloques no pinta el cuerpo de un bloque plegado, así que el
 * selector de archivo se desmontaba con la subida en marcha y, al terminar, no
 * quedaba nadie para apuntarla: el archivo quedaba en la biblioteca y el bloque
 * seguía en «— ninguno —». La salida no es pintar los plegados —con doce
 * bloques de texto rico serían doce TipTap montados— sino que escriba quien
 * sigue montado, el editor de bloques, buscando el bloque por su clave en el
 * arreglo de ese instante.
 *
 * ## Por qué se pinta el componente de verdad
 *
 * La primera versión de esta prueba ejercitaba `escritorPorClave` con una ficha
 * de mentira que reimplementaba a mano lo que hace `Campos.tsx`, y vigilaba el
 * cable con expresiones regulares sobre la fuente. Se daba la razón a sí misma:
 * un cambio que conservara el texto y rompiera la conducta —poner `vigentes` en
 * un efecto pasivo con otro nombre— pasaba en verde. Y no vio el caso que un
 * revisor encontró leyendo: guardar durante la subida cambiaba la clave del
 * bloque nuevo y la subida volvía a no encontrarlo.
 *
 * Así que aquí se monta `ControlDeCampo` con un campo de bloques en un DOM de
 * `happy-dom`, dentro de `StrictMode` como en `next dev`, y se pulsa lo que
 * pulsaría una persona: plegar, subir, teclear, guardar. Lo único que se
 * sustituye es lo que no tiene sentido fuera del navegador:
 *
 *  - El subidor (`subidorQueAvisa`), porque habla con el servidor por
 *    `XMLHttpRequest`. El de aquí retiene cada subida hasta que la prueba la
 *    suelta, que es lo que permite hacer cosas «mientras sube».
 *  - `next/dynamic`, que difiere TipTap y three.js; ningún bloque de estas
 *    pruebas lleva texto rico ni modelo.
 *  - `FormularioDocumento`, que no se deja montar sin router ni acciones de
 *    servidor. Su papel lo hace `fichaDePrueba`, que guarda el valor del campo
 *    y lo reemplaza entero al cambiar, que es lo que hace `cambiar` allí, y
 *    que sabe «guardar» como lo hace su resiembra tras `router.refresh()`:
 *    tomando del servidor los bloques con `id` y sin `_clave`.
 *
 * `happy-dom` no está en `devDependencies`: llega con `@lexical/headless`, que
 * trae el editor de Payload. Si un día desaparece, esta prueba falla al
 * arrancar diciendo que no encuentra el entorno, no en silencio.
 */

const subidas = vi.hoisted(
  () => [] as { nombre: string; soltar: (respuesta: Respuesta<{ id: string }>) => void }[],
)

vi.mock('@/admin/subidas', async (original) => ({
  ...(await original<typeof import('@/admin/subidas')>()),
  subidorQueAvisa: () => (formulario: FormData) =>
    new Promise<Respuesta<{ id: string }>>((soltar) => {
      subidas.push({ nombre: (formulario.get('archivo') as File).name, soltar })
    }),
}))

vi.mock('next/dynamic', () => ({ default: () => () => null }))

// Se importa después de los `vi.mock`, que Vitest sube arriba de todo igual.
const { ControlDeCampo } = await import('@/components/admin/formulario/Campos')

// --------------------------------------------------------------- la ficha

const CUERPO: Campo = { tipo: 'bloques', nombre: 'cuerpo', etiqueta: 'Cuerpo' }

interface EstadoDeLaFicha {
  cuerpo: Fila[]
  biblioteca: { id: string; etiqueta: string }[]
  /** Falso cuando se está en otra pestaña de la ficha y el editor no se pinta. */
  enEstaPestana: boolean
}

function fichaDePrueba(cuerpo: Fila[]) {
  let estado: EstadoDeLaFicha = { cuerpo, biblioteca: [], enEstaPestana: true }
  const oyentes = new Set<() => void>()
  const fijar = (cambio: Partial<EstadoDeLaFicha>) => {
    estado = { ...estado, ...cambio }
    for (const oyente of oyentes) oyente()
  }
  return {
    leer: () => estado,
    fijar,
    suscribir: (oyente: () => void) => {
      oyentes.add(oyente)
      return () => oyentes.delete(oyente)
    },
  }
}

type Ficha = ReturnType<typeof fichaDePrueba>

function Formulario({ ficha }: { ficha: Ficha }) {
  const estado = useSyncExternalStore(ficha.suscribir, ficha.leer)
  if (!estado.enEstaPestana) return createElement('p', null, 'Otra pestaña')
  return createElement(ControlDeCampo, {
    campo: CUERPO,
    valor: estado.cuerpo,
    alCambiar: (nuevo) => ficha.fijar({ cuerpo: nuevo as Fila[] }),
    relaciones: { medios: estado.biblioteca },
    // Lo de `cargarRelacion(coleccion, true)`: vuelve a pedir la lista, que ya
    // trae lo recién subido.
    alRecargarRelacion: () => ficha.fijar({ biblioteca: [...ficha.leer().biblioteca] }),
  })
}

let raiz: Root | null = null
let contenedor: HTMLElement

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  subidas.length = 0
  contenedor = document.createElement('div')
  document.body.appendChild(contenedor)
})

afterEach(() => {
  act(() => raiz?.unmount())
  raiz = null
  contenedor.remove()
})

function pintar(ficha: Ficha) {
  act(() => {
    raiz = createRoot(contenedor)
    raiz.render(createElement(StrictMode, null, createElement(Formulario, { ficha })))
  })
}

// ------------------------------------------------ lo que hace una persona

const bloquesEnPantalla = () => [...contenedor.querySelectorAll<HTMLElement>('.bloque-editor')]

const boton = (etiqueta: string): HTMLButtonElement => {
  const encontrado = contenedor.querySelector<HTMLButtonElement>(`button[aria-label="${etiqueta}"]`)
  if (!encontrado) throw new Error(`No hay botón «${etiqueta}» en pantalla`)
  return encontrado
}

const pulsar = (etiqueta: string) => act(() => boton(etiqueta).click())

function elegirArchivoEn(bloque: HTMLElement, nombre: string) {
  const entrada = bloque.querySelector<HTMLInputElement>('input[type="file"]')
  if (!entrada) throw new Error('El bloque no tiene selector de archivo pintado')
  const archivo = new File(['contenido'], nombre, { type: 'image/png' })
  Object.defineProperty(entrada, 'files', { configurable: true, value: [archivo] })
  act(() => {
    entrada.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function teclearEn(bloque: HTMLElement, texto: string) {
  const entrada = bloque.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')
  if (!entrada) throw new Error('El bloque no tiene campo de texto pintado')
  // Por el `set` del prototipo: React vigila el `value` del elemento y un
  // `entrada.value = …` directo no lo daría por cambiado.
  const fijarValor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    fijarValor.call(entrada, texto)
    entrada.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** El servidor escribe el archivo en la biblioteca y contesta. */
async function terminarSubida(ficha: Ficha, cual: string, id: string) {
  const subida = subidas.find((s) => s.nombre === cual)
  if (!subida) throw new Error(`No hay subida en marcha de «${cual}»`)
  ficha.leer().biblioteca.push({ id, etiqueta: cual })
  await act(async () => {
    subida.soltar({ exito: true, datos: { id } })
  })
}

/**
 * Lo que hace `FormularioDocumento` al volver un guardado sin teclas durante el
 * viaje: toma el documento del servidor entero. Los bloques vuelven en el mismo
 * orden, cada uno con su `id`, y sin `_clave`, que no viaja.
 */
function guardar(ficha: Ficha) {
  let siguiente = 900
  act(() => {
    ficha.fijar({
      cuerpo: ficha.leer().cuerpo.map((bloque) => {
        const { [CLAVE_DE_FILA]: _descartada, ...delServidor } = bloque
        void _descartada
        return { ...delServidor, id: bloque.id ?? `6650f${siguiente++}` }
      }),
    })
  })
}

const valorDelSelector = (bloque: HTMLElement) => bloque.querySelector('select')?.value

const tresBloques = (): Fila[] => [
  { id: '11', blockType: 'video', video: null, pie: 'Abordaje' },
  { blockType: 'imagen', imagen: null, pie: 'Radiografía AP', [CLAVE_DE_FILA]: nuevaClave() },
  { id: '13', blockType: 'video', video: null, pie: 'Cierre' },
]

// ------------------------------------------------------------------ pruebas

describe('una subida que termina con su bloque plegado', () => {
  it('elige el archivo en su bloque, y el cuerpo plegado sigue sin pintarse', async () => {
    const ficha = fichaDePrueba(tresBloques())
    pintar(ficha)
    elegirArchivoEn(bloquesEnPantalla()[1], 'rx-ap.png')
    expect(bloquesEnPantalla()[1].textContent).toContain('Subiendo «rx-ap.png»')

    pulsar('Plegar imagen 2')
    // Lo que no se quería: pintar los plegados para no desmontar el selector.
    expect(bloquesEnPantalla()[1].querySelector('.bloque-cuerpo')).toBeNull()

    await terminarSubida(ficha, 'rx-ap.png', '501')
    expect(ficha.leer().cuerpo[1]).toMatchObject({ blockType: 'imagen', imagen: '501', pie: 'Radiografía AP' })

    pulsar('Desplegar imagen 2')
    expect(valorDelSelector(bloquesEnPantalla()[1])).toBe('501')
  })

  it('aunque entretanto se suba al primer puesto y se teclee en otro bloque', async () => {
    const ficha = fichaDePrueba(tresBloques())
    pintar(ficha)
    elegirArchivoEn(bloquesEnPantalla()[1], 'rx-ap.png')
    pulsar('Plegar imagen 2')
    pulsar('Subir imagen 2')
    teclearEn(bloquesEnPantalla()[1], 'Abordaje, corregido durante la subida')

    await terminarSubida(ficha, 'rx-ap.png', '502')

    const cuerpo = ficha.leer().cuerpo
    expect(cuerpo.map((b) => b.blockType)).toEqual(['imagen', 'video', 'video'])
    expect(cuerpo[0].imagen).toBe('502')
    // Lo tecleado durante la subida sigue ahí, y en el vídeo que ocupa ahora el
    // sitio de la imagen no se apuntó nada.
    expect(cuerpo[1]).toMatchObject({ video: null, pie: 'Abordaje, corregido durante la subida' })
    expect(cuerpo[1]).not.toHaveProperty('imagen')
    // Y sigue plegado donde quedó.
    expect(bloquesEnPantalla()[0].className).toContain('bloque-plegado')
  })

  it('dos subidas en dos bloques plegados terminan cada una en el suyo', async () => {
    const ficha = fichaDePrueba(tresBloques())
    pintar(ficha)
    elegirArchivoEn(bloquesEnPantalla()[1], 'rx-ap.png')
    elegirArchivoEn(bloquesEnPantalla()[2], 'cierre.mp4')
    pulsar('Plegar imagen 2')
    pulsar('Plegar video 3')
    pulsar('Bajar imagen 2')

    await terminarSubida(ficha, 'cierre.mp4', '602')
    await terminarSubida(ficha, 'rx-ap.png', '601')

    expect(ficha.leer().cuerpo).toMatchObject([
      { blockType: 'video', video: null },
      { blockType: 'video', video: '602' },
      { blockType: 'imagen', imagen: '601' },
    ])
  })

  it('un bloque quitado durante la subida no resucita', async () => {
    const ficha = fichaDePrueba(tresBloques())
    pintar(ficha)
    elegirArchivoEn(bloquesEnPantalla()[1], 'rx-ap.png')
    // `Campos.tsx` pregunta con el `confirm` global antes de quitar.
    vi.stubGlobal('confirm', () => true)
    pulsar('Quitar imagen 2')
    vi.unstubAllGlobals()

    await terminarSubida(ficha, 'rx-ap.png', '503')

    expect(ficha.leer().cuerpo.map((b) => b.blockType)).toEqual(['video', 'video'])
    expect(ficha.leer().cuerpo.some((b) => 'imagen' in b)).toBe(false)
  })

  it('si el editor entero se desmontó —otra pestaña de la ficha— no escribe con lo que pintó', async () => {
    const ficha = fichaDePrueba(tresBloques())
    pintar(ficha)
    elegirArchivoEn(bloquesEnPantalla()[1], 'rx-ap.png')
    act(() => ficha.fijar({ enEstaPestana: false }))

    await terminarSubida(ficha, 'rx-ap.png', '504')

    expect(ficha.leer().cuerpo[1].imagen).toBeNull()
  })
})

describe('una subida en un bloque nuevo que se guarda mientras sube', () => {
  it('termina eligiendo el archivo en su bloque, aunque el bloque ya no se llame igual', async () => {
    const ficha = fichaDePrueba(tresBloques())
    pintar(ficha)
    elegirArchivoEn(bloquesEnPantalla()[1], 'rx-ap.png')
    pulsar('Plegar imagen 2')

    guardar(ficha)
    expect(claveEstable(ficha.leer().cuerpo[1])).toMatch(/^id-/)

    await terminarSubida(ficha, 'rx-ap.png', '505')

    expect(ficha.leer().cuerpo[1]).toMatchObject({ blockType: 'imagen', imagen: '505', id: expect.any(String) })
    // El guardado no lo desplegó: el plegado sigue a la clave de antes.
    expect(bloquesEnPantalla()[1].className).toContain('bloque-plegado')
    pulsar('Desplegar imagen 2')
    expect(valorDelSelector(bloquesEnPantalla()[1])).toBe('505')
  })

  it('desplegado, la subida sigue a la vista: guardar no desmonta el bloque', async () => {
    const ficha = fichaDePrueba(tresBloques())
    pintar(ficha)
    elegirArchivoEn(bloquesEnPantalla()[1], 'rx-ap.png')
    const selectorAntes = bloquesEnPantalla()[1].querySelector('select')

    guardar(ficha)

    // Si el `key` cambiara, React habría tirado el bloque y la barra de
    // «Subiendo…» se iría a mitad de viaje, que se lee como subida cancelada.
    expect(bloquesEnPantalla()[1].querySelector('select')).toBe(selectorAntes)
    expect(bloquesEnPantalla()[1].textContent).toContain('Subiendo «rx-ap.png»')

    await terminarSubida(ficha, 'rx-ap.png', '506')
    expect(valorDelSelector(bloquesEnPantalla()[1])).toBe('506')
    expect(ficha.leer().cuerpo[1].imagen).toBe('506')
  })

  it('y si después de guardar se mueve, también', async () => {
    const ficha = fichaDePrueba(tresBloques())
    pintar(ficha)
    elegirArchivoEn(bloquesEnPantalla()[1], 'rx-ap.png')
    pulsar('Plegar imagen 2')
    guardar(ficha)
    pulsar('Bajar imagen 2')

    await terminarSubida(ficha, 'rx-ap.png', '507')

    expect(ficha.leer().cuerpo).toMatchObject([
      { blockType: 'video', video: null },
      { blockType: 'video', video: null },
      { blockType: 'imagen', imagen: '507' },
    ])
  })
})

// ---------------------------------------------- las piezas sin el componente

describe('cómo se llaman los bloques nuevos después de guardar', () => {
  const enviados = (): Fila[] => [
    { id: '11', blockType: 'video' },
    { blockType: 'imagen', [CLAVE_DE_FILA]: 'c41' },
    { blockType: 'texto', [CLAVE_DE_FILA]: 'c42' },
  ]
  const recibidos = (): Fila[] => [
    { id: '11', blockType: 'video' },
    { id: 'a1', blockType: 'imagen' },
    { id: 'a2', blockType: 'texto' },
  ]

  it('empareja por posición cada clave del cliente con el `id` que le puso el servidor', () => {
    expect(clavesQueRecibieronId(enviados(), recibidos())).toEqual([
      ['c41', 'id-a1'],
      ['c42', 'id-a2'],
    ])
  })

  it('es todo o nada: si una sola posición no cuadra, no empareja ninguna', () => {
    // Otro largo.
    expect(clavesQueRecibieronId(enviados(), recibidos().slice(0, 2))).toEqual([])
    // Otro tipo en una posición: la lista no es la misma en el mismo orden.
    const cambiados = recibidos()
    ;[cambiados[1], cambiados[2]] = [cambiados[2], cambiados[1]]
    expect(clavesQueRecibieronId(enviados(), cambiados)).toEqual([])
    // Un `id` que ya estaba y ahora es otro.
    expect(clavesQueRecibieronId(enviados(), [{ id: '99', blockType: 'video' }, ...recibidos().slice(1)])).toEqual([])
  })

  it('el mismo arreglo, o uno sin bloques nuevos, no renombra nada', () => {
    const mismos = enviados()
    expect(clavesQueRecibieronId(mismos, mismos)).toEqual([])
    expect(clavesQueRecibieronId(recibidos(), recibidos())).toEqual([])
  })

  it('el escritor resuelve la clave vieja al escribir', () => {
    let bloques: Fila[] = recibidos()
    const escribir = escritorPorClave(() => ({
      bloques,
      alCambiar: (nuevos) => {
        bloques = nuevos
      },
      renombradas: new Map(clavesQueRecibieronId(enviados(), recibidos())),
    }))
    expect(escribir('c41', 'imagen', '777')).toBe(true)
    expect(bloques[1]).toMatchObject({ id: 'a1', imagen: '777' })
    expect(escribir('c99', 'imagen', '778')).toBe(false)
  })
})

describe('la identidad de un bloque', () => {
  it('es el `id` de Payload, o la clave del cliente para lo recién creado', () => {
    expect(claveEstable({ id: 7 })).toBe('id-7')
    expect(claveEstable({ id: 'abc' })).toBe('id-abc')
    expect(claveEstable({ [CLAVE_DE_FILA]: 'c9' })).toBe('c9')
    expect(claveEstable({ id: 7, [CLAVE_DE_FILA]: 'c9' })).toBe('id-7')
  })

  it('sin ninguna de las dos no hay identidad para escribir, aunque React use la posición', () => {
    expect(claveEstable({ blockType: 'imagen' })).toBeNull()
    expect(claveDe({ blockType: 'imagen' }, 4)).toBe('pos-4')
    expect(conCampoEnElBloque([{ blockType: 'imagen' }], 'pos-0', 'imagen', 1)).toBeNull()
  })

  it('las claves nuevas no se repiten', () => {
    const claves = new Set(Array.from({ length: 50 }, nuevaClave))
    expect(claves.size).toBe(50)
  })
})
