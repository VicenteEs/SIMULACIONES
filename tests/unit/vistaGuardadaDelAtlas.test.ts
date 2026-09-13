import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import {
  HOLGURA_RELATIVA_DEL_PIVOTE,
  cajaDeLoVisible,
  esElObjetivoPorOmision,
  pivoteEnSitio,
} from '@/atlas/pivote'
import { objetivoFueraDeLoVisible } from '@/atlas/vistaGuardada'
import { VISTA_INICIAL, type CatalogoDelAtlas } from '@/atlas/formato'

/**
 * Dos reparos al pivote del atlas, cada uno con su regla y su cableado.
 *
 * El primero: al abrir una preparación, el objetivo solo se recolocaba si era
 * exactamente el de `VISTA_INICIAL`. Las de pierna guardadas pulsando
 * «Encuadrar» con el cuerpo entero —objetivo en el centro del cuerpo, a 3,5 cm
 * del de omisión— seguían girando alrededor de la pelvis en la ficha.
 *
 * El segundo: `vistaActual()` adelantaba la recolocación pendiente, y el taller
 * se la pide tras cada clic en el lienzo. Apagar piezas con el ratón deslizaba
 * la escena en cada clic, bajo el cursor que ya apuntaba a la siguiente.
 *
 * La regla del primero se prueba con el catálogo real, porque es el catálogo
 * real el que tumba la solución que parecía obvia (la holgura relativa del
 * pivote). El cableado de los dos se lee de la fuente del visor: el entorno de
 * pruebas no tiene jsdom y el componente no se puede montar.
 */

describe('un objetivo fuera de lo visible', () => {
  const caja = new THREE.Box3(new THREE.Vector3(-0.15, 0.05, -0.05), new THREE.Vector3(-0.03, 0.91, 0.02))

  it('dentro de la caja se respeta, aunque esté lejos del centro', () => {
    // El foco de fractura llevado a mano a la tibia distal: el pivote lo
    // movería, esta regla no.
    const foco = new THREE.Vector3(-0.08, 0.1, -0.01)
    expect(pivoteEnSitio(foco, caja)).toBe(false)
    expect(objetivoFueraDeLoVisible(foco, caja)).toBe(false)
  })

  it('en el borde, con el redondeo a milímetros de `vistaActual()`, sigue dentro', () => {
    expect(objetivoFueraDeLoVisible(new THREE.Vector3(-0.0295, 0.5, 0), caja)).toBe(false)
    expect(objetivoFueraDeLoVisible(new THREE.Vector3(-0.025, 0.5, 0), caja)).toBe(true)
  })

  it('sin nada encendido no hay fuera: no hay a dónde llevarlo', () => {
    expect(objetivoFueraDeLoVisible(new THREE.Vector3(...VISTA_INICIAL.objetivo), null)).toBe(false)
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

  const piernaDerecha = () => {
    const huesos = new Set(
      real!.piezas
        .filter((p) => /^Right (tibia|fibula|femur|patella)$/.test(p.nombre))
        .map((p) => p.id),
    )
    expect(huesos.size).toBe(4)
    return cajaDeLoVisible(real!, huesos, 0)!
  }

  it.runIf(real)('«Encuadrar» con el cuerpo entero y apagar el resto: se recoloca', () => {
    // Es el caso del reparo. El objetivo que dejó «Encuadrar» es el centro de
    // la caja del cuerpo, y no es el de omisión: la primera regla no lo ve.
    const centroDelCuerpo = cajaDeLoVisible(real!, null, 0)!.getCenter(new THREE.Vector3())
    expect(esElObjetivoPorOmision(centroDelCuerpo)).toBe(false)
    expect(objetivoFueraDeLoVisible(centroDelCuerpo, piernaDerecha())).toBe(true)
  })

  it.runIf(real)('con la holgura relativa del pivote no se recolocaría, y por eso no se usa', () => {
    // La cabeza del fémur llega a 3,2 cm de la línea media y el 5 % de una
    // pierna de 86 cm son 4,3: ampliada así, la caja se traga la pelvis. Si
    // alguien «alinea» `objetivoFueraDeLoVisible` con `pivoteEnSitio`, esta
    // prueba explica por qué la anterior empieza a fallar.
    const pierna = piernaDerecha()
    const lado = Math.max(...pierna.getSize(new THREE.Vector3()).toArray())
    const centroDelCuerpo = cajaDeLoVisible(real!, null, 0)!.getCenter(new THREE.Vector3())
    const ampliada = pierna.clone().expandByScalar(lado * HOLGURA_RELATIVA_DEL_PIVOTE)
    expect(ampliada.containsPoint(centroDelCuerpo)).toBe(true)
    expect(ampliada.containsPoint(new THREE.Vector3(...VISTA_INICIAL.objetivo))).toBe(true)
  })

  it.runIf(real)('un desplazamiento con el botón derecho que no llegó a la pierna: se recoloca', () => {
    const desplazado = new THREE.Vector3(0.04, 0.85, 0.01)
    expect(esElObjetivoPorOmision(desplazado)).toBe(false)
    expect(objetivoFueraDeLoVisible(desplazado, piernaDerecha())).toBe(true)
  })

  it.runIf(real)('el foco llevado a mano sobre la tibia distal se respeta', () => {
    const tibia = real!.piezas.find((p) => p.nombre === 'Right tibia')!
    const [min, max] = tibia.caja
    const foco = new THREE.Vector3((min[0] + max[0]) / 2, min[1] + 0.06, (min[2] + max[2]) / 2)
    const pierna = piernaDerecha()
    // Lejos del centro —el pivote sí lo movería— y aun así es del autor.
    expect(pivoteEnSitio(foco, pierna)).toBe(false)
    expect(objetivoFueraDeLoVisible(foco, pierna)).toBe(false)
  })

  it.runIf(real)('el cuerpo completo con la vista por omisión no se toca', () => {
    const cuerpo = cajaDeLoVisible(real!, null, 0)
    const omision = new THREE.Vector3(...VISTA_INICIAL.objetivo)
    expect(objetivoFueraDeLoVisible(omision, cuerpo)).toBe(false)
    // Y aunque la primera regla lo reconozca, `seguirLoVisible` no lo mueve.
    expect(pivoteEnSitio(omision, cuerpo)).toBe(true)
  })
})

// ------------------------------------------------------------------- cableado

const visor = readFileSync(
  join(process.cwd(), 'src', 'components', 'atlas', 'VisorAtlas.tsx'),
  'utf8',
).replace(/\r\n/g, '\n')

/** El cuerpo de una función de módulo, hasta la siguiente llave de cierre en columna 0. */
function funcionDe(nombre: string): string {
  const casa = visor.match(new RegExp(`\\nfunction ${nombre}\\(([\\s\\S]*?)\\n\\}`))
  expect(casa, `no se encontró \`function ${nombre}\``).not.toBeNull()
  return casa![1]
}

function entre(inicio: string, fin: string): string {
  const desde = visor.indexOf(inicio)
  expect(desde, `no se encontró «${inicio}»`).toBeGreaterThan(-1)
  const hasta = visor.indexOf(fin, desde + 1)
  expect(hasta, `no se encontró «${fin}» después de «${inicio}»`).toBeGreaterThan(desde)
  return visor.slice(desde, hasta)
}

describe('al abrir una vista guardada', () => {
  it('se recoloca con las dos reglas, medidas sobre la caja de lo que va a verse', () => {
    const cuerpo = funcionDe('recolocarVistaGuardada')
    expect(cuerpo).toContain('cajaDeLoVisible(catalogo, visibles, separacion, taller.escena?.datos)')
    expect(cuerpo).toMatch(
      /esElObjetivoPorOmision\(controles\.target\)\s*\|\|\s*objetivoFueraDeLoVisible\(controles\.target, caja\)/,
    )
    expect(visor).toContain("import { objetivoFueraDeLoVisible } from '@/atlas/vistaGuardada'")
  })

  it('pasa por ahí tanto `irA` como el final de la carga', () => {
    expect(entre('irA: (vista, visibles) => {', '}))')).toContain('recolocarVistaGuardada(')
    expect(funcionDe('recolocarAlCargar')).toContain('recolocarVistaGuardada(')
  })
})

describe('`vistaActual()` pregunta sin mover nada', () => {
  const vistaActual = () => entre('vistaActual: () => {', 'encuadrar: () => {')

  it('no dispara la recolocación que espera', () => {
    const cuerpo = vistaActual()
    expect(cuerpo).not.toContain('seguirLoVisible(')
    expect(cuerpo).not.toContain('cancelarEspera(')
    expect(cuerpo).not.toContain('clearTimeout(')
  })

  it('suma el salto pendiente, y solo si hay una espera', () => {
    const cuerpo = vistaActual()
    expect(cuerpo).toMatch(
      /t\.esperaDelPivote === undefined \? null : saltoDelPivote\(t, catalogo, v, s\)/,
    )
    expect(cuerpo).toContain('vistaDe(t, s, salto)')
    expect(funcionDe('vistaDe')).toMatch(/if \(salto\) resto\.add\(salto\)/)
  })

  it('el salto que predice es el mismo que da la espera: una sola cuenta', () => {
    // Si `seguirLoVisible` volviera a calcular por su cuenta, lo guardado y lo
    // que hace la cámara al cumplirse la espera se podrían separar.
    const seguir = funcionDe('seguirLoVisible')
    expect(seguir).toContain('saltoDelPivote(taller, catalogo, visibles, separacion)')
    expect(seguir).not.toContain('cajaDeLoVisible(')
    const salto = funcionDe('saltoDelPivote')
    expect(salto).toContain('cajaDeLoVisible(')
    expect(salto).toContain('pivoteEnSitio(')
  })

  it('y la cuenta no toca el estado del visor', () => {
    const salto = funcionDe('saltoDelPivote')
    expect(salto).not.toMatch(/taller\.\w+\s*=[^=]/)
    expect(salto).not.toContain('cancelarEspera(')
    expect(salto).not.toContain('pedirDibujo')
    // `.clone()` antes de `.add(`: sumar sobre `controles.target` movería el
    // pivote de verdad dentro de una pregunta.
    expect(salto).toContain('controles.target.clone().add(')
    expect(salto).not.toMatch(/controles\.target\.add\(/)
  })
})
