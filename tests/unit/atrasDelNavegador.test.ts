import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  apuntarCambiosSinGuardar,
  PREGUNTA_DE_SALIDA,
  puedeSalirSinPerderCambios,
  vigilarSalidasDelNavegador,
  type NavegadorVigilado,
} from '@/admin/salidaDelEditor'

/**
 * Atrás y Adelante del navegador preguntan antes de sacar a nadie de una
 * pantalla con cambios sin guardar.
 *
 * La suite corre en `node` y sin DOM, así que el navegador de aquí es de
 * juguete, pero no inventado: reproduce lo que se midió en Chrome 152 antes de
 * escribir la guardia, que es lo único de lo que depende.
 *
 *  - Un viaje por el historial es una tarea que cambia la entrada actual,
 *    dispara `currententrychange` y **después** `popstate`, en ese orden.
 *  - Los oyentes de `window` corren en orden de registro. El «router» de aquí
 *    se registra antes que la guardia, como el de Next, que vive en la raíz.
 *  - El router hace lo que hace `onPopState` en
 *    `next/dist/client/components/app-router.js`: ignora un evento sin `state`
 *    y, con él, pinta la dirección y descarta la acción que tuviera en cola.
 *    Las dos cosas se leen de Next al final de este archivo, para que una
 *    actualización que las cambie haga fallar esto y no la pantalla.
 *
 * Lo que se mira es lo que vería quien usa el panel: qué pantalla pinta el
 * router, en qué entrada queda el historial, cuántas veces se pregunta y si se
 * perdió la acción que guardar dejó en marcha.
 */

const fuente = (...partes: string[]): string =>
  readFileSync(join(process.cwd(), ...partes), 'utf8')

const codigoDe = (texto: string): string =>
  texto
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')

/** El `PopStateEvent` del juguete: su `state` es un accesor del prototipo, como en el DOM. */
class PopstateDeJuguete extends Event {
  readonly #estado: unknown
  constructor(estado: unknown) {
    super('popstate')
    this.#estado = estado
  }
  get state(): unknown {
    return this.#estado
  }
}

interface Entrada {
  key: string
  url: string
  estado: unknown
}

function navegadorDeJuguete(
  urls: string[],
  opciones: { routerDespuesDeLaGuardia?: boolean; sinNavigationApi?: boolean; temporizadorAntes?: boolean } = {},
) {
  let claves = 0
  const entrada = (url: string): Entrada => ({
    key: `k${claves++}`,
    url,
    estado: { __NA: true, arbol: url },
  })
  const entradas = urls.map(entrada)
  let actual = entradas.length - 1
  // Dos colas, porque el navegador no promete en qué orden corren un
  // `setTimeout(0)` y un viaje pedido con `history.go()` en la misma tarea.
  const viajes: (() => void)[] = []
  const temporizadores: (() => void)[] = []

  const ventana = new EventTarget()
  const vista = (indice: number) => ({
    key: entradas[indice].key,
    index: indice,
    url: `http://panel.local${entradas[indice].url}`,
  })
  // Con `defineProperty` y no con `Object.assign`, que copiaría el valor del
  // accesor en el momento y dejaría la entrada actual congelada.
  const navegacion = Object.defineProperty(new EventTarget(), 'currentEntry', {
    get: () => vista(actual),
  }) as EventTarget & { readonly currentEntry: ReturnType<typeof vista> }
  const cambioDeEntrada = (tipo: string, desde: ReturnType<typeof vista>) =>
    navegacion.dispatchEvent(Object.assign(new Event('currententrychange'), { navigationType: tipo, from: desde }))

  const historial = {
    go(distancia: number) {
      viajes.push(() => {
        const destino = actual + distancia
        if (distancia === 0 || destino < 0 || destino >= entradas.length) return
        const desde = vista(actual)
        actual = destino
        cambioDeEntrada('traverse', desde)
        ventana.dispatchEvent(new PopstateDeJuguete(entradas[actual].estado))
      })
    },
    /** Lo que hace el router al seguir un enlace: apila y trunca lo que hubiera delante. */
    pushState(url: string) {
      const desde = vista(actual)
      entradas.splice(actual + 1)
      entradas.push(entrada(url))
      actual += 1
      cambioDeEntrada('push', desde)
    },
  }

  const router = {
    pantalla: entradas[actual].url,
    /** Lo que `router.refresh()` o `router.replace()` dejan en cola al guardar. */
    pendiente: null as string | null,
    descartadas: [] as string[],
    vistas: 0,
  }
  const oyenteDelRouter = (evento: Event) => {
    const estado = (evento as PopstateDeJuguete).state
    if (!estado) return
    router.vistas += 1
    router.pantalla = entradas[actual].url
    if (router.pendiente) router.descartadas.push(router.pendiente)
    router.pendiente = null
  }
  if (!opciones.routerDespuesDeLaGuardia) ventana.addEventListener('popstate', oyenteDelRouter)

  const preguntas: string[] = []
  let respuesta = false

  const vigilado: NavegadorVigilado = {
    ventana,
    historial,
    navegacion: opciones.sinNavigationApi ? undefined : navegacion,
    eventoPopstate: PopstateDeJuguete,
    preguntar: (texto) => {
      preguntas.push(texto)
      return respuesta
    },
    despues: (tarea) => {
      temporizadores.push(tarea)
    },
  }

  return {
    vigilado,
    ventana,
    historial,
    router,
    preguntas,
    responder: (valor: boolean) => {
      respuesta = valor
    },
    registrarRouterAhora: () => ventana.addEventListener('popstate', oyenteDelRouter),
    /** Corre las tareas pendientes, también las que se encolen mientras tanto. */
    correr: () => {
      for (let vueltas = 0; viajes.length + temporizadores.length > 0; vueltas += 1) {
        if (vueltas > 100) throw new Error('el historial no para de moverse')
        const primero = opciones.temporizadorAntes ? temporizadores : viajes
        const cola = primero.length > 0 ? primero : primero === viajes ? temporizadores : viajes
        cola.shift()!()
      }
    },
    get url() {
      return entradas[actual].url
    },
    get indice() {
      return actual
    },
    get largo() {
      return entradas.length
    },
  }
}

const aDesmontar: (() => void)[] = []
afterEach(() => {
  while (aDesmontar.length > 0) aDesmontar.pop()!()
})

function montar(navegador: ReturnType<typeof navegadorDeJuguete>) {
  aDesmontar.push(vigilarSalidasDelNavegador(navegador.vigilado))
  return navegador
}

const conCambios = () => aDesmontar.push(apuntarCambiosSinGuardar())

describe('Atrás del navegador', () => {
  it('sin cambios pendientes navega sin preguntar', () => {
    const b = montar(navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/contenido/patologias/1']))
    b.historial.go(-1)
    b.correr()
    expect(b.preguntas).toEqual([])
    expect(b.url).toBe('/admin-panel/contenido')
    expect(b.router.pantalla).toBe('/admin-panel/contenido')
  })

  it('con cambios pregunta con la misma frase que la barra lateral', () => {
    const b = montar(navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/contenido/patologias/1']))
    conCambios()
    b.historial.go(-1)
    b.correr()
    expect(b.preguntas).toEqual([PREGUNTA_DE_SALIDA])
  })

  it('si se contesta que no, vuelve a la ficha y el router no se entera ni de la ida ni de la vuelta', () => {
    const b = montar(navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/contenido/patologias/1']))
    conCambios()
    b.historial.go(-1)
    b.correr()
    expect(b.url).toBe('/admin-panel/contenido/patologias/1')
    expect(b.indice).toBe(1)
    // Si el router hubiera visto la ida, habría pintado el listado y desmontado
    // el editor con la pregunta todavía abierta.
    expect(b.router.vistas).toBe(0)
    expect(b.router.pantalla).toBe('/admin-panel/contenido/patologias/1')
    // La vuelta es otro viaje, y no vuelve a preguntar.
    expect(b.preguntas).toHaveLength(1)
  })

  it('si se contesta que sí, el viaje llega al router como cualquier otro', () => {
    const b = montar(navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/contenido/patologias/1']))
    conCambios()
    b.responder(true)
    b.historial.go(-1)
    b.correr()
    expect(b.url).toBe('/admin-panel/contenido')
    expect(b.router.pantalla).toBe('/admin-panel/contenido')
    expect(b.preguntas).toHaveLength(1)
  })

  it('cancelar no descarta lo que guardar dejó en cola en el router', () => {
    // Es la razón de no haber usado una entrada de historial de más: cualquier
    // viaje que el router ve descarta su acción pendiente, y la de después de
    // guardar es el `refresh` o el `replace` que lleva la ficha nueva a su id.
    const b = montar(navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/contenido/patologias/nuevo']))
    conCambios()
    b.router.pendiente = 'replace a /admin-panel/contenido/patologias/7'
    b.historial.go(-1)
    b.correr()
    expect(b.router.descartadas).toEqual([])
    expect(b.router.pendiente).toBe('replace a /admin-panel/contenido/patologias/7')
  })

  it('se puede cancelar dos veces seguidas: la segunda pulsación vuelve a preguntar', () => {
    const b = montar(navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/atlas']))
    conCambios()
    b.historial.go(-1)
    b.correr()
    b.historial.go(-1)
    b.correr()
    expect(b.preguntas).toHaveLength(2)
    expect(b.url).toBe('/admin-panel/atlas')
    expect(b.router.vistas).toBe(0)
  })

  it('un salto de varias entradas, desde el menú de Atrás, vuelve las mismas', () => {
    const b = montar(
      navegadorDeJuguete(['/admin-panel', '/admin-panel/comentarios', '/admin-panel/contenido', '/admin-panel/contenido/casos-ao/3']),
    )
    conCambios()
    b.historial.go(-3)
    b.correr()
    expect(b.preguntas).toHaveLength(1)
    expect(b.indice).toBe(3)
    expect(b.router.vistas).toBe(0)
  })

  it('funciona igual si la guardia se registra antes que el router', () => {
    // Pasa al entrar al panel cargando la página: el efecto del hijo corre
    // antes que el de la raíz. Si la guardia destapara el `state` al terminar
    // su oyente, el router, que va detrás, lo vería.
    const b = navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/contenido/patologias/1'], {
      routerDespuesDeLaGuardia: true,
    })
    montar(b)
    b.registrarRouterAhora()
    conCambios()
    b.historial.go(-1)
    b.correr()
    expect(b.router.vistas).toBe(0)
    expect(b.url).toBe('/admin-panel/contenido/patologias/1')
  })

  it('la vuelta también se esconde si el temporizador de destapar corre antes que ella', () => {
    // `setTimeout(0)` y el viaje de `history.go()` salen de la misma tarea y el
    // navegador no promete cuál llega antes. Si destapar va primero, la vuelta
    // tiene que taparse por su cuenta, o el router la vería y descartaría lo
    // que tuviera en cola.
    const b = montar(
      navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/contenido/patologias/1'], { temporizadorAntes: true }),
    )
    conCambios()
    b.router.pendiente = 'refresh tras guardar'
    b.historial.go(-1)
    b.correr()
    expect(b.url).toBe('/admin-panel/contenido/patologias/1')
    expect(b.router.vistas).toBe(0)
    expect(b.router.descartadas).toEqual([])
  })

  it('un cambio de ancla dentro de la misma pantalla no pregunta', () => {
    const b = montar(navegadorDeJuguete(['/admin-panel/contenido/patologias/1', '/admin-panel/contenido/patologias/1#manejo']))
    conCambios()
    b.historial.go(-1)
    b.correr()
    expect(b.preguntas).toEqual([])
  })
})

describe('Adelante del navegador', () => {
  it('pregunta igual, y si se cancela vuelve hacia atrás', () => {
    const b = montar(navegadorDeJuguete(['/admin-panel/atlas', '/admin-panel/comentarios']))
    b.historial.go(-1)
    b.correr()
    expect(b.url).toBe('/admin-panel/atlas')
    // Ya en el taller, con una preparación a medias.
    conCambios()
    b.historial.go(1)
    b.correr()
    expect(b.preguntas).toEqual([PREGUNTA_DE_SALIDA])
    expect(b.url).toBe('/admin-panel/atlas')
    expect(b.router.pantalla).toBe('/admin-panel/atlas')
  })
})

describe('lo que no debe preguntar', () => {
  it('guardar no deja nada en el historial que haya que retirar', () => {
    const b = montar(navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/contenido/patologias/1']))
    const desapuntar = apuntarCambiosSinGuardar()
    b.correr()
    desapuntar()
    b.correr()
    expect(b.largo).toBe(2)
    expect(b.indice).toBe(1)
    expect(b.router.vistas).toBe(0)
    // Y el Atrás de después sale sin preguntar y sin pasos muertos.
    b.historial.go(-1)
    b.correr()
    expect(b.preguntas).toEqual([])
    expect(b.router.pantalla).toBe('/admin-panel/contenido')
  })

  it('salir por la barra lateral pregunta una vez, la de la barra', () => {
    const b = montar(navegadorDeJuguete(['/admin-panel', '/admin-panel/contenido/patologias/1']))
    const desapuntar = apuntarCambiosSinGuardar()
    b.responder(true)
    // `alNavegar` en `NavegacionAdmin.tsx`, y el router apila la dirección.
    expect(puedeSalirSinPerderCambios(b.vigilado.preguntar)).toBe(true)
    b.historial.pushState('/admin-panel/comentarios')
    // El editor se desmonta y se desapunta.
    desapuntar()
    b.correr()
    expect(b.preguntas).toHaveLength(1)
    // Y volver a la ficha desde allí no es salir de nada.
    b.historial.go(-1)
    b.correr()
    expect(b.preguntas).toHaveLength(1)
    expect(b.router.pantalla).toBe('/admin-panel/contenido/patologias/1')
  })
})

describe('cerrar la pestaña o salir a otro documento', () => {
  it('`beforeunload` avisa solo si hay algo que perder', () => {
    const b = montar(navegadorDeJuguete(['/admin-panel']))
    const sinNada = new Event('beforeunload', { cancelable: true })
    b.ventana.dispatchEvent(sinNada)
    expect(sinNada.defaultPrevented).toBe(false)
    conCambios()
    const conAlgo = new Event('beforeunload', { cancelable: true })
    b.ventana.dispatchEvent(conAlgo)
    expect(conAlgo.defaultPrevented).toBe(true)
  })

  it('sin Navigation API no toca Atrás, pero `beforeunload` sigue puesto', () => {
    const b = montar(navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/atlas'], { sinNavigationApi: true }))
    conCambios()
    b.historial.go(-1)
    b.correr()
    // Sin saber cuántas entradas se saltó no hay vuelta honrada: no se pregunta
    // una cosa que luego no se puede cumplir.
    expect(b.preguntas).toEqual([])
    expect(b.router.pantalla).toBe('/admin-panel/contenido')
    const descarga = new Event('beforeunload', { cancelable: true })
    b.ventana.dispatchEvent(descarga)
    expect(descarga.defaultPrevented).toBe(true)
  })
})

describe('desmontar la guardia', () => {
  it('deja `PopStateEvent` como estaba y deja de preguntar', () => {
    const original = Object.getOwnPropertyDescriptor(PopstateDeJuguete.prototype, 'state')
    const b = navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/atlas'])
    const desmontar = vigilarSalidasDelNavegador(b.vigilado)
    desmontar()
    expect(Object.getOwnPropertyDescriptor(PopstateDeJuguete.prototype, 'state')).toEqual(original)
    conCambios()
    b.historial.go(-1)
    b.correr()
    expect(b.preguntas).toEqual([])
    expect(b.router.pantalla).toBe('/admin-panel/contenido')
    const descarga = new Event('beforeunload', { cancelable: true })
    b.ventana.dispatchEvent(descarga)
    expect(descarga.defaultPrevented).toBe(false)
  })

  it('montar, desmontar y montar —el Modo Estricto— no encadena dos tapas', () => {
    const b = navegadorDeJuguete(['/admin-panel/contenido', '/admin-panel/atlas'])
    vigilarSalidasDelNavegador(b.vigilado)()
    montar(b)
    conCambios()
    b.historial.go(-1)
    b.correr()
    expect(b.preguntas).toHaveLength(1)
    expect(b.router.vistas).toBe(0)
    expect(b.url).toBe('/admin-panel/atlas')
  })
})

describe('el cable', () => {
  const CONTORNO = codigoDe(fuente('src', 'app', '(frontend)', 'admin-panel', 'layout.tsx'))
  const GUARDIA = codigoDe(fuente('src', 'components', 'admin', 'GuardiaDeAtras.tsx'))

  it('el contorno del panel monta la guardia una sola vez', () => {
    expect(CONTORNO).toContain("import { GuardiaDeAtras } from '@/components/admin/GuardiaDeAtras'")
    expect(CONTORNO.match(/<GuardiaDeAtras\b/g) ?? []).toHaveLength(1)
  })

  it('la guardia monta la vigilancia con el navegador de verdad y la desmonta al irse', () => {
    expect(GUARDIA).toMatch(/useEffect\(\(\) => \{ .* return vigilarSalidasDelNavegador\(\{/)
    expect(GUARDIA).toMatch(/\}, \[\]\) return null/)
    expect(GUARDIA).toContain('historial: window.history')
    expect(GUARDIA).toContain('navegacion: navegador.navigation')
    expect(GUARDIA).toContain('PopStateEvent')
    expect(GUARDIA).toContain('window.confirm(texto)')
  })
})

describe('lo que la guardia supone de Next', () => {
  // Si una actualización de Next cambia cualquiera de estas dos cosas, la
  // guardia deja de funcionar sin que falle nada más: o el router pinta la
  // pantalla de destino con la pregunta abierta, o tapar el `state` deja de
  // bastar para que no se entere.
  const ROUTER = fuente('node_modules', 'next', 'dist', 'client', 'components', 'app-router.js')
  const COLA = fuente('node_modules', 'next', 'dist', 'client', 'components', 'app-router-instance.js')

  it('su oyente de `popstate` ignora un evento sin `state`', () => {
    expect(ROUTER).toMatch(/const onPopState = \(event\)=>\{\s*if \(!event\.state\) \{[^}]*return;\s*\}/)
    expect(ROUTER).toContain("window.addEventListener('popstate', onPopState)")
  })

  it('y un viaje que sí ve descarta la acción que tenga en cola', () => {
    expect(COLA).toMatch(
      /payload\.type === _routerreducertypes\.ACTION_NAVIGATE \|\| payload\.type === _routerreducertypes\.ACTION_RESTORE\) \{[\s\S]{0,300}actionQueue\.pending\.discarded = true/,
    )
  })

  it('no usa la Navigation API por su cuenta', () => {
    // Si la usara, sus viajes podrían llegar por `navigate` y no por
    // `popstate`, y tapar el `state` no los escondería.
    expect(ROUTER).not.toMatch(/navigation\.addEventListener/)
  })
})
