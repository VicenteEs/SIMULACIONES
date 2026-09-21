import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import {
  DURACION_DEL_PIVOTE_MS,
  avanzarTraslacion,
  cajaDeLoVisible,
  crearTraslacion,
  esElObjetivoPorOmision,
  pivoteEnSitio,
  restoDeLaTraslacion,
} from '@/atlas/pivote'
import { objetivoFueraDeLoVisible } from '@/atlas/vistaGuardada'
import { VISTA_INICIAL, type CatalogoDelAtlas, type PiezaDelAtlas } from '@/atlas/formato'

/**
 * El pivote del atlas sigue a lo visible.
 *
 * Palabras del traumatólogo: «si por ejemplo dejo solo la pierna no me toma el
 * centro de gravedad de la pierna sino todo el cuerpo aunque no se vea». El
 * visor ya sabía encuadrar lo visible, pero solo al pulsar «Encuadrar»: apagar
 * piezas no movía `controles.target`, que se quedaba en la pelvis de un cuerpo
 * apagado.
 *
 * Dos mitades, como en el resto de pruebas del atlas. La regla se prueba con
 * números en `src/atlas/pivote.ts`, que es `.ts` puro y corre en `node`. Y el
 * cableado se vigila leyendo la fuente del visor y del taller, porque el
 * entorno no tiene jsdom (ver `vitest.config.ts`): lo que más ha fallado en
 * este repositorio es una función escrita y probada a la que nadie llama, y la
 * regla de abajo, sin su llamada en el visor, no arregla nada.
 */

function pieza(id: string, nombre: string, caja: PiezaDelAtlas['caja']): PiezaDelAtlas {
  return {
    id,
    nombre,
    fma: id,
    sistema: 'skeletal',
    region: 'miembro-inferior-derecho',
    origenRegion: 'anatomia',
    paquete: 0,
    pos: 0,
    nor: 0,
    idx: 0,
    vertices: 0,
    indices: 0,
    caja,
  }
}

// Medidas redondeadas del catálogo real: una tibia, un fémur y un cráneo, que
// es lo bastante lejos de la pierna como para que se note cuál es el centro.
const CATALOGO: CatalogoDelAtlas = {
  version: 'prueba-pivote',
  fuente: 'prueba',
  licencia: 'prueba',
  sujeto: 'prueba',
  triangulos: 0,
  sistemas: [],
  regiones: [],
  paquetes: [],
  piezas: [
    pieza('tibia', 'Right tibia', [
      [-0.15, 0.05, -0.05],
      [-0.03, 0.45, 0.02],
    ]),
    pieza('femur', 'Right femur', [
      [-0.15, 0.45, -0.05],
      [-0.03, 0.91, 0.01],
    ]),
    pieza('craneo', 'Skull', [
      [-0.1, 1.5, -0.12],
      [0.1, 1.73, 0.1],
    ]),
  ],
}

describe('la caja de lo visible', () => {
  it('se hace solo con lo encendido', () => {
    const caja = cajaDeLoVisible(CATALOGO, new Set(['tibia', 'femur']), 0)!
    expect(caja.min.toArray()).toEqual([-0.15, 0.05, -0.05])
    expect(caja.max.toArray()).toEqual([-0.03, 0.91, 0.02])
  })

  it('con `null` son todas las piezas', () => {
    const caja = cajaDeLoVisible(CATALOGO, null, 0)!
    expect(caja.max.y).toBeCloseTo(1.73)
  })

  it('sin nada encendido no hay caja, y el pivote se queda quieto', () => {
    // Una caja vacía tiene el centro en el infinito: recolocar hacia ella
    // mandaría la cámara fuera del mundo.
    expect(cajaDeLoVisible(CATALOGO, new Set(), 0)).toBeNull()
    expect(pivoteEnSitio(new THREE.Vector3(0, 0.9, 0), null)).toBe(true)
  })

  it('traslada cada pieza con su dirección de separación', () => {
    // Las direcciones viven en los tres primeros canales de la textura de
    // estado, cuatro por pieza en el orden del catálogo.
    const datos = new Float32Array(CATALOGO.piezas.length * 4)
    datos.set([-1, 0, 0], 0 * 4) // la tibia se aleja hacia la derecha del paciente
    const separada = cajaDeLoVisible(CATALOGO, new Set(['tibia']), 0.5, datos)!
    expect(separada.min.x).toBeCloseTo(-0.65)
    expect(separada.max.x).toBeCloseTo(-0.53)
    // Con el cuerpo cerrado las direcciones no cuentan aunque estén escritas.
    expect(cajaDeLoVisible(CATALOGO, new Set(['tibia']), 0, datos)!.min.x).toBeCloseTo(-0.15)
  })

  it('con el cuerpo separado y sin escena, la caja es otra: por eso `irA` no decide ahí', () => {
    // Es el caso de abrir una preparación mientras bajan los paquetes. Sin
    // escena no hay `datos`, y la caja sale sin separar: el objetivo que el
    // autor dejó sobre la tibia separada —el foco de fractura— queda fuera de
    // ella y se recolocaría, cuando con la caja buena está dentro y es suyo.
    const datos = new Float32Array(CATALOGO.piezas.length * 4)
    datos.set([-1, 0, 0], 0 * 4)
    const tibia = new Set(['tibia'])
    const foco = new THREE.Vector3(-0.59, 0.25, -0.015)
    expect(objetivoFueraDeLoVisible(foco, cajaDeLoVisible(CATALOGO, tibia, 0.5, undefined))).toBe(true)
    expect(objetivoFueraDeLoVisible(foco, cajaDeLoVisible(CATALOGO, tibia, 0.5, datos))).toBe(false)
    // Y sin separación da igual tener escena o no, que es por lo que en ese
    // caso `irA` sí decide en el acto.
    expect(cajaDeLoVisible(CATALOGO, tibia, 0, undefined)).toEqual(
      cajaDeLoVisible(CATALOGO, tibia, 0, datos),
    )
  })
})

describe('cuándo se recoloca el pivote', () => {
  it('con la pierna sola, el objetivo del cuerpo entero está fuera de sitio', () => {
    // Es exactamente la queja: la pierna girando alrededor de la pelvis.
    const pierna = cajaDeLoVisible(CATALOGO, new Set(['tibia', 'femur']), 0)
    expect(pivoteEnSitio(new THREE.Vector3(...VISTA_INICIAL.objetivo), pierna)).toBe(false)
  })

  it('una deriva pequeña frente al tamaño de lo visible no mueve nada', () => {
    // Sin holgura, apagar una falange con la pierna entera encendida
    // recolocaría la cámara un milímetro, y veinte clics serían veinte saltos.
    const pierna = cajaDeLoVisible(CATALOGO, new Set(['tibia', 'femur']), 0)!
    const centro = pierna.getCenter(new THREE.Vector3())
    expect(pivoteEnSitio(centro.clone().add(new THREE.Vector3(0, 0.03, 0)), pierna)).toBe(true)
    expect(pivoteEnSitio(centro.clone().add(new THREE.Vector3(0, 0.1, 0)), pierna)).toBe(false)
  })

  it('reconoce el objetivo de las preparaciones guardadas antes de esto', () => {
    expect(esElObjetivoPorOmision(new THREE.Vector3(...VISTA_INICIAL.objetivo))).toBe(true)
    // `vistaActual()` redondea a milímetros: sigue siendo el mismo.
    expect(esElObjetivoPorOmision(new THREE.Vector3(0.001, 0.9, -0.001))).toBe(true)
    // Uno que dejó «Encuadrar» o que se llevó a mano es de su autor.
    expect(esElObjetivoPorOmision(new THREE.Vector3(-0.09, 0.48, -0.01))).toBe(false)
  })
})

describe('con el atlas real', () => {
  let real: CatalogoDelAtlas | null = null
  try {
    real = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'atlas', 'catalogo.json'), 'utf8'),
    ) as CatalogoDelAtlas
  } catch {
    real = null
  }

  it.runIf(real)('el cuerpo completo no se recoloca desde la vista por omisión', () => {
    // Si esto falla, abrir el taller —que toma `VISTA_INICIAL` como referencia
    // antes de que el visor exista— daría la cámara por movida en cuanto
    // termine la carga, y el taller preguntaría por cambios sin guardar que
    // nadie hizo. Es la coincidencia que sostiene no tener un caso aparte para
    // el cuerpo completo en `recolocarVistaGuardada`.
    const cuerpo = cajaDeLoVisible(real!, null, 0)
    expect(pivoteEnSitio(new THREE.Vector3(...VISTA_INICIAL.objetivo), cuerpo)).toBe(true)
  })

  it.runIf(real)('la pierna derecha sola sí, y hacia la pierna', () => {
    const huesos = new Set(
      real!.piezas
        .filter((p) => /^Right (tibia|fibula|femur|patella)$/.test(p.nombre))
        .map((p) => p.id),
    )
    expect(huesos.size).toBe(4)
    const pierna = cajaDeLoVisible(real!, huesos, 0)!
    expect(pivoteEnSitio(new THREE.Vector3(...VISTA_INICIAL.objetivo), pierna)).toBe(false)
    const centro = pierna.getCenter(new THREE.Vector3())
    // Derecha del paciente es x negativa en este atlas, y la rodilla va por
    // debajo de la pelvis.
    expect(centro.x).toBeLessThan(-0.05)
    expect(centro.y).toBeLessThan(0.6)
  })
})

describe('el deslizamiento', () => {
  it('suma exactamente el total al terminar', () => {
    const total = new THREE.Vector3(-0.09, -0.42, -0.01)
    const tr = crearTraslacion(total, 1000, DURACION_DEL_PIVOTE_MS)
    const acumulado = new THREE.Vector3()
    let terminada = false
    for (let t = 1000; !terminada; t += 16) {
      const r = avanzarTraslacion(tr, t)
      acumulado.add(r.paso)
      terminada = r.terminada
    }
    expect(acumulado.distanceTo(total)).toBeLessThan(1e-9)
    expect(restoDeLaTraslacion(tr).length()).toBeLessThan(1e-9)
  })

  it('a mitad de camino deja un resto, que es lo que se guarda como destino', () => {
    const total = new THREE.Vector3(0, -0.4, 0)
    const tr = crearTraslacion(total, 0, 300)
    const { paso, terminada } = avanzarTraslacion(tr, 150)
    expect(terminada).toBe(false)
    // Lo aplicado más lo que falta es el total: `vistaActual()` suma el resto a
    // la cámara de ahora y obtiene donde va a quedar.
    expect(paso.clone().add(restoDeLaTraslacion(tr)).distanceTo(total)).toBeLessThan(1e-9)
  })

  it('con duración cero —menos movimiento— termina en el primer paso', () => {
    const total = new THREE.Vector3(0.1, 0.2, 0.3)
    const r = avanzarTraslacion(crearTraslacion(total, 0, 0), 0)
    expect(r.terminada).toBe(true)
    expect(r.paso.distanceTo(total)).toBeLessThan(1e-9)
  })

  it('no toca el vector que se le pasa', () => {
    const total = new THREE.Vector3(1, 0, 0)
    avanzarTraslacion(crearTraslacion(total, 0, 0), 0)
    expect(total.toArray()).toEqual([1, 0, 0])
  })
})

// ------------------------------------------------------------------- cableado

const leer = (...partes: string[]) =>
  readFileSync(join(process.cwd(), ...partes), 'utf8').replace(/\r\n/g, '\n')

const visor = leer('src', 'components', 'atlas', 'VisorAtlas.tsx')
const taller = leer('src', 'components', 'admin', 'atlas', 'TallerDeAtlas.tsx')

/** El cuerpo de una función de módulo, hasta la siguiente llave de cierre en columna 0. */
function funcionDe(fuente: string, nombre: string): string {
  const casa = fuente.match(new RegExp(`\\nfunction ${nombre}\\(([\\s\\S]*?)\\n\\}`))
  expect(casa, `no se encontró \`function ${nombre}\``).not.toBeNull()
  return casa![1]
}

/** El trozo de fuente que va de una marca a la siguiente. */
function entre(fuente: string, inicio: string, fin: string): string {
  const desde = fuente.indexOf(inicio)
  expect(desde, `no se encontró «${inicio}»`).toBeGreaterThan(-1)
  const hasta = fuente.indexOf(fin, desde + 1)
  expect(hasta, `no se encontró «${fin}» después de «${inicio}»`).toBeGreaterThan(desde)
  return fuente.slice(desde, hasta)
}

describe('el visor usa la regla del pivote', () => {
  it('no tiene otra caja propia: «Encuadrar» y el pivote miden con la misma', () => {
    // Dos copias del cálculo acabarían centrando en un sitio y girando en otro.
    //
    // El pivote ya no mide dentro de `seguirLoVisible`: la cuenta se mudó a
    // `saltoDelPivote` para que `vistaActual()` pudiera predecir el salto sin
    // darlo (ver `vistaGuardadaDelAtlas.test.ts`). Se sigue exigiendo lo mismo
    // —una caja, la de `pivote.ts`, y la regla de la holgura— en el sitio
    // donde vive ahora, y que `seguirLoVisible` pase por él y no por otra.
    expect(visor).not.toContain('new THREE.Box3(')
    expect(funcionDe(visor, 'encuadrarVisible')).toContain('cajaDeLoVisible(')
    const salto = funcionDe(visor, 'saltoDelPivote')
    expect(salto).toContain('cajaDeLoVisible(')
    expect(salto).toContain('pivoteEnSitio(')
    const seguir = funcionDe(visor, 'seguirLoVisible')
    expect(seguir).toContain('saltoDelPivote(')
    expect(seguir).not.toContain('getCenter(')
    // Y al abrir una vista guardada, la caja de la segunda regla es también
    // esa: si fuera otra, «fuera de lo visible» se mediría contra un volumen
    // distinto del que después centra el pivote.
    expect(funcionDe(visor, 'recolocarVistaGuardada')).toContain('cajaDeLoVisible(')
  })

  it('recoloca cuando cambian las piezas encendidas o la separación, con espera', () => {
    const efecto = entre(visor, 'el pivote sigue a lo visible', 'return (\n')
    expect(efecto).toContain('setTimeout(')
    expect(efecto).toContain('ESPERA_DEL_PIVOTE_MS')
    expect(efecto).toContain('seguirLoVisible(')
    expect(efecto).toContain('[catalogo, visibles, separacion]')
    // Y no recoloca lo que `irA` o la carga ya atendieron.
    expect(efecto).toContain('seleccionDelPivote')
  })

  it('desliza dentro del bucle de dibujo, y el bucle dibuja mientras desliza', () => {
    const bucle = entre(visor, 'render.setAnimationLoop(() => {', 'return () => {')
    expect(bucle).toContain('avanzarPivote(')
    expect(bucle).toMatch(/if \(!sucio && !movio && !deslizando\) return/)
  })

  it('atiende `prefers-reduced-motion`', () => {
    expect(funcionDe(visor, 'prefiereMenosMovimiento')).toContain('prefers-reduced-motion: reduce')
    expect(funcionDe(visor, 'seguirLoVisible')).toContain('prefiereMenosMovimiento()')
  })

  it('guarda el destino del pivote, no el fotograma de ahora', () => {
    const mando = entre(visor, 'useImperativeHandle(mando', '// ---------------------------------------------------------------- montaje')
    expect(entre(mando, 'vistaActual:', 'encuadrar:')).toContain('vistaDe(')
    expect(funcionDe(visor, 'vistaDe')).toContain('restoDeLaTraslacion(')
  })

  it('al abrir una vista guardada y al terminar la carga pasa por la regla de las antiguas', () => {
    const mando = entre(visor, 'useImperativeHandle(mando', '// ---------------------------------------------------------------- montaje')
    expect(entre(mando, 'irA:', '}))')).toContain('recolocarVistaGuardada(')
    expect(funcionDe(visor, 'recolocarVistaGuardada')).toContain('esElObjetivoPorOmision(')
    // La regla de la caja: una preparación guardada con el fallo lleva el
    // objetivo fuera de lo que se ve, sea el de omisión o no.
    expect(funcionDe(visor, 'recolocarVistaGuardada')).toContain('objetivoFueraDeLoVisible(')
    expect(visor).toMatch(/recolocarAlCargar\(\s*taller\.current/)
  })

  it('sin escena y con el cuerpo separado, `irA` deja decidir a la carga', () => {
    // Decidir con la caja sin separar movía el foco de fractura del autor, y la
    // carga lo volvía a mover: dos decisiones sobre dos cajas distintas.
    const mando = entre(visor, 'useImperativeHandle(mando', '// ---------------------------------------------------------------- montaje')
    const irA = entre(mando, 'irA:', '}))')
    const aplazada = entre(irA, 'if (!t.escena && vista.separacion > 0) {', '} else {')
    expect(aplazada).not.toContain('recolocarVistaGuardada(')
    expect(aplazada).not.toContain('seguirLoVisible(')
    // Anota la selección, o el efecto de seguimiento y `recolocarAlCargar` la
    // tomarían por un cambio del traumatólogo y la recolocarían sin reglas.
    expect(aplazada).toContain(
      't.seleccionDelPivote = { visibles: seleccion, separacion: vista.separacion }',
    )
    expect(entre(irA, '} else {', 'controles.update()')).toContain('recolocarVistaGuardada(')
  })

  it('al cargar avisa de la vista guardada que movió, y solo de esa', () => {
    const cargar = funcionDe(visor, 'recolocarAlCargar')
    const guardada = entre(cargar, 'previa.separacion === separacion) {', '\n  }\n')
    expect(guardada).toMatch(
      /const antes = vistaDe\(taller, separacion\)\s*recolocarVistaGuardada\(taller, catalogo, visibles, separacion\)\s*const despues = vistaDe\(taller, separacion\)/,
    )
    expect(guardada).toContain('mismaVista(antes, despues) ? null : { antes, despues }')
    // El cambio del traumatólogo durante la descarga no se avisa.
    expect(cargar).toMatch(/seguirLoVisible\(taller, catalogo, visibles, separacion, false\)\s*return null/)
    // Y el montaje lo entrega, leyendo la función del ref y no de la prop
    // congelada en el primer pintado.
    expect(visor).toMatch(/const asentada = recolocarAlCargar\(\s*taller\.current/)
    expect(visor).toContain(
      'if (asentada) ultimas.current.alAsentarVista?.(asentada.antes, asentada.despues)',
    )
    expect(entre(visor, 'ultimas.current = {', '}')).toContain('alAsentarVista')
  })

  it('enseña en español el nombre de la pieza bajo el ratón', () => {
    // El nombre lo prepara `loQueSeSenala`, que contesta por igual de una pieza
    // entera y de un fragmento de hueso partido (D-130), y siempre traducido.
    const senalar = entre(visor, 'const loQueSeSenala = ', '// --- mover y girar piezas')
    expect(senalar).toMatch(/nombre: nombreEnEspanol\(catalogo\.piezas\[entera\.indice\]\.nombre\)/)
    expect(senalar).toMatch(/nombreEnEspanol\(catalogo\.piezas\[i\]\.nombre\)/)
    expect(visor).toContain('setNombreFlotante({ texto: senalada.nombre, x: local.x, y: local.y })')
    expect(visor).not.toMatch(/nombre: catalogo\.piezas\[[a-z.]+\]\.nombre/)
  })
})

describe('el taller usa lo que el visor decide', () => {
  it('toma como referencia lo que devuelve `irA`, con el mismo conjunto que recibe React', () => {
    // Con lo pedido como referencia, abrir una preparación antigua —cuyo pivote
    // el visor recoloca— la daría por movida sin que nadie la tocara.
    const abrir = entre(taller, 'const abrir = ', 'const guardar = ')
    expect(abrir).toContain('setVisibles(piezasAbiertas)')
    expect(abrir).toMatch(/const vistaAbierta =\s*mando\.current\?\.irA\(r\.datos\.contenido\.vista, piezasAbiertas\)/)
    // El último argumento son las piezas movidas que trae la preparación
    // (D-129) y sus huesos partidos (D-130): sin ellos en la referencia, abrir
    // una preparación con un fragmento desplazado
    // la daría por cambiada nada más abrirla.
    expect(abrir).toMatch(
      /fijarReferencia\(\s*piezasAbiertas,[\s\S]*vistaAbierta,\s*movidasAbiertas,\s*cortesAbiertos,\s*aspectosAbiertos,\s*\[marcasAbiertas, vistasAbiertas, gruposAbiertos\],\s*\)/,
    )
    expect(abrir.indexOf('irA(')).toBeLessThan(abrir.indexOf('fijarReferencia('))

    const deCero = entre(taller, 'const empezarDeCero = ', 'const abrir = ')
    expect(deCero).toContain('mando.current?.irA(VISTA_INICIAL, todas)')
    expect(deCero).toContain("fijarReferencia(todas, '', '', vista)")
  })

  it('mueve la referencia a la vista que el visor asentó al cargar, si era la de antes', () => {
    // Sin esto, abrir con el cuerpo separado durante la descarga —o antes de que
    // llegara el visor— dejaba la referencia en la cámara de antes de moverla y
    // saltaba «cambios sin guardar» sin que nadie hubiera tocado nada.
    const visorEnElTaller = entre(taller, '<VisorAtlas', '/>')
    expect(visorEnElTaller).toContain('alAsentarVista={asentarReferencia}')
    const asentar = entre(taller, 'const asentarReferencia', '\n\n')
    expect(asentar).toContain(
      'setReferencia((r) => (mismoEncuadre(r.vista, antes) ? { ...r, vista: despues } : r))',
    )
    // La misma holgura con la que se decide si la cámara se movió: con dos
    // comparaciones distintas, una no reconocería lo que la otra da por quieto.
    expect(entre(taller, 'const encuadreMovido', 'const revisarEncuadre')).toContain(
      '!mismoEncuadre(ahora, referencia.vista)',
    )
    expect(taller).not.toMatch(/Math\.abs\(n - antes\./)
  })

  it('guarda la vista que da el visor, que ya lleva el pivote', () => {
    expect(entre(taller, 'const guardar = ', 'const exportar = ')).toContain(
      'mando.current?.vistaActual()',
    )
  })

  it('busca y enseña las candidatas a exportar en español', () => {
    const candidatas = entre(taller, 'const candidatas', 'const conAviso')
    expect(candidatas).toContain('casaConLaBusqueda(p.nombre, filtroProtagonista)')
    expect(candidatas).not.toContain('.includes(')
    const lista = entre(taller, '{candidatas.lista.map(', '{candidatas.total === 0')
    expect(lista).toContain('nombreEnEspanol(pieza.nombre)')
    expect(lista).not.toMatch(/<span>\{pieza\.nombre\}<\/span>/)
  })

  it('pinta cada pieza exportada con su capa cuando llega, y los nodos si no', () => {
    expect(taller).toMatch(/piezas\?: \{ nodo: string; etiqueta: string; rol: RolDePieza \}\[\]/)
    const resultado = entre(taller, '{exportado ? (', '{exportado.perdidas.length')
    expect(resultado).toContain('exportado.piezas.map(')
    // Con la tabla del esquema y no con una propia. `NOMBRE_DE_CAPA` era la
    // copia que el taller escribía a mano y se borró: la capa se lee de
    // `src/admin/etiquetaDeRol.ts`, que es lo que enseña el formulario del caso
    // donde el traumatólogo va a buscarla. `etiquetaDeRol.test.ts` vigila que
    // la tabla diga lo mismo que el esquema; aquí, que el resultado la use.
    expect(resultado).toContain('ETIQUETA_DE_ROL[p.rol] ?? p.rol')
    expect(taller).not.toContain('NOMBRE_DE_CAPA')
    expect(resultado).toContain('exportado.nodos.map(')
  })
})
