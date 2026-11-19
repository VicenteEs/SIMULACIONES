import { describe, it, expect } from 'vitest'
import {
  caminoAlrededorDelColchon,
  colocarALaArsenalera,
  colocarLaMesa,
  distanciaAlColchon,
  haciaLaBandeja,
  largoDelCamino,
  MEDIDAS_DE_LA_SALA as M,
  type ColocacionDeLaMesa,
  type ColocacionDeLaPersona,
  type DecubitoDeLaMesa,
  type LugarDeLaMesa,
  type PuntoDelSuelo,
} from '@/lib/mesaDeArsenalera'

/**
 * Dónde se para la arsenalera (pedido del dueño): «al costado externo de la mesa, mirando hacia la camilla o el centro,
 * y nunca sobre el paciente», y que siga así si se mueve la mesa.
 *
 * Es geometría: se prueba con números, en el marco del colchón. Lo que se ve, que es lo que importa, se mira en el
 * navegador; aquí se cuidan las reglas que un cambio de medidas o de sitios podría romper sin ningún error.
 */

const DECUBITOS: DecubitoDeLaMesa[] = ['supino', 'prono']
const FIJOS: LugarDeLaMesa[] = ['derecha', 'izquierda', 'pies', 'encima']
const ZONAS = [-0.6, 0, 0.5, 0.8]
const MINIMO = M.radioDeLaPersona + M.holguraAlColchon

/** Hacia dónde mira ella, en el suelo: el +Z de su modelo con ese giro. */
const frente = (p: ColocacionDeLaPersona) => ({ x: Math.sin(p.giro), z: Math.cos(p.giro) })

/**
 * Si el círculo de sus pies toca el rectángulo de la base de la mesa (en planta, como en `mesaDeArsenalera.test.ts`). Los
 * pies y no la falda: el ruedo de la bata pasa sobre las patas.
 */
function pisaLaBase(mesa: ColocacionDeLaMesa, p: ColocacionDeLaPersona): boolean {
  const largo = haciaLaBandeja(mesa.giro)
  const ancho = { x: -largo.z, z: largo.x }
  // Su centro, en el marco de la mesa: a lo largo de la bandeja y a lo ancho.
  const dx = p.x - mesa.x
  const dz = p.z - mesa.z
  const u = dx * largo.x + dz * largo.z
  const v = dx * ancho.x + dz * ancho.z
  const cercaU = Math.min(Math.max(u, -(M.delCentroAlPoste + 0.12)), M.medioLargoDeLaBandeja)
  const cercaV = Math.min(Math.max(v, -M.medioAnchoDeLaBase), M.medioAnchoDeLaBase)
  return Math.hypot(u - cercaU, v - cercaV) < M.radioDeLosPies - 1e-9
}

/** Hacia dónde mira, comparado con una dirección del suelo: 1 si mira justo hacia allí, 0 si de lado, −1 si de espaldas. */
function cosenoHacia(p: ColocacionDeLaPersona, x: number, z: number): number {
  const f = frente(p)
  const largo = Math.hypot(x - p.x, z - p.z)
  return (f.x * (x - p.x) + f.z * (z - p.z)) / largo
}

/** Cuánto mira hacia la camilla: hacia el punto del colchón más cercano. */
function cosenoHaciaLaCamilla(p: ColocacionDeLaPersona): number {
  const cx = Math.min(Math.max(p.x, -M.medioAnchoDelColchon), M.medioAnchoDelColchon)
  const cz = Math.min(Math.max(p.z, -M.medioLargoDelColchon), M.medioLargoDelColchon)
  return cosenoHacia(p, cx, cz)
}

/**
 * Dónde cae lo que alcanza con las manos (`alcanceDeLasManos` por delante), en el marco de la mesa: a lo largo de la
 * bandeja (desde el poste hacia la punta) y a lo ancho. La figura de ahora tiene los brazos abajo (D-418): lo que se
 * cuida es que la bandeja le quede a mano, no que las apoye.
 */
function alcanceEnLaMesa(mesa: ColocacionDeLaMesa, p: ColocacionDeLaPersona): { u: number; v: number } {
  const f = frente(p)
  const largo = haciaLaBandeja(mesa.giro)
  const ancho = { x: -largo.z, z: largo.x }
  const dx = p.x + f.x * M.alcanceDeLasManos - mesa.x
  const dz = p.z + f.z * M.alcanceDeLasManos - mesa.z
  return { u: dx * largo.x + dz * largo.z, v: dx * ancho.x + dz * ancho.z }
}

describe('colocarALaArsenalera: en los sitios fijos de la mesa', () => {
  const casos = DECUBITOS.flatMap((decubito) => FIJOS.flatMap((lugar) => ZONAS.map((zDeLaZona) => ({ decubito, lugar, zDeLaZona }))))

  it.each(casos)('nunca sobre el paciente: $lugar, $decubito, zona $zDeLaZona', ({ decubito, lugar, zDeLaZona }) => {
    const mesa = colocarLaMesa(lugar, { decubito, zDeLaZona })
    const p = colocarALaArsenalera(mesa)
    expect(distanciaAlColchon(p.x, p.z)).toBeGreaterThanOrEqual(MINIMO - 1e-9)
  })

  it.each(casos)('mira hacia la camilla, por encima de su bandeja: $lugar, $decubito, zona $zDeLaZona', ({ decubito, lugar, zDeLaZona }) => {
    const mesa = colocarLaMesa(lugar, { decubito, zDeLaZona })
    const p = colocarALaArsenalera(mesa)
    // En los sitios fijos la bandeja va paralela al borde del colchón y ella detrás: mirar a la bandeja es mirar de
    // frente a la camilla, y los dos cosenos dan 1.
    expect(cosenoHacia(p, mesa.x, mesa.z)).toBeGreaterThan(0.999)
    expect(cosenoHaciaLaCamilla(p)).toBeGreaterThan(0.999)
  })

  it.each(DECUBITOS.flatMap((decubito) => (['derecha', 'izquierda', 'pies'] as const).flatMap((lugar) => ZONAS.map((zDeLaZona) => ({ decubito, lugar, zDeLaZona })))))(
    'con la bandeja al alcance de la mano: $lugar, $decubito, zona $zDeLaZona',
    ({ decubito, lugar, zDeLaZona }) => {
      const mesa = colocarLaMesa(lugar, { decubito, zDeLaZona })
      const p = colocarALaArsenalera(mesa)
      const alcance = alcanceEnLaMesa(mesa, p)
      // Dentro de la bandeja y no en su borde: a cinco centímetros al menos, lo que ocupa una palma.
      expect(Math.abs(alcance.u)).toBeLessThan(M.medioLargoDeLaBandeja - 0.05)
      expect(Math.abs(alcance.v)).toBeLessThan(M.medioAnchoDeLaBandeja - 0.05)
      // Y no hasta el medio: del lado de ella, no por encima del instrumental.
      expect(Math.abs(alcance.u) + Math.abs(alcance.v)).toBeGreaterThan(0.05)
    },
  )

  it.each(casos)('queda junto a la mesa, sin pisarla: $lugar, $decubito, zona $zDeLaZona', ({ decubito, lugar, zDeLaZona }) => {
    const mesa = colocarLaMesa(lugar, { decubito, zDeLaZona })
    const p = colocarALaArsenalera(mesa)
    // A la mano de la bandeja: a menos de un metro de su centro, que es el alcance de quien pasa instrumental.
    expect(Math.hypot(p.x - mesa.x, p.z - mesa.z)).toBeLessThan(1)
    expect(pisaLaBase(mesa, p), 'su falda entra en la base de la mesa').toBe(false)
  })

  it.each(DECUBITOS.flatMap((decubito) => (['derecha', 'izquierda', 'pies'] as const).map((lugar) => ({ decubito, lugar }))))(
    'al costado externo: la mesa queda entre ella y la camilla ($lugar, $decubito)',
    ({ decubito, lugar }) => {
      const mesa = colocarLaMesa(lugar, { decubito, zDeLaZona: 0.3 })
      const p = colocarALaArsenalera(mesa)
      expect(distanciaAlColchon(p.x, p.z)).toBeGreaterThan(distanciaAlColchon(mesa.x, mesa.z))
    },
  )

  it('en los sitios de los lados y a los pies se para a un costado de la bandeja, no tras el poste ni en la punta', () => {
    for (const decubito of DECUBITOS) {
      for (const lugar of ['derecha', 'izquierda', 'pies'] as const) {
        expect(['costado-a', 'costado-b'], `${lugar}, ${decubito}`).toContain(colocarALaArsenalera(colocarLaMesa(lugar, { decubito, zDeLaZona: 0.3 })).lado)
      }
    }
  })

  it('en la mesa de Mayo, la que vuela sobre el paciente, se para tras el poste, fuera de la camilla', () => {
    // La bandeja cruza el colchón y a sus costados cae la cabecera o los pies del paciente: queda el extremo del poste.
    for (const decubito of DECUBITOS) {
      const mesa = colocarLaMesa('encima', { decubito, zDeLaZona: 0.3 })
      const p = colocarALaArsenalera(mesa)
      expect(p.lado).toBe('poste')
      // Y mira hacia el paciente, a lo largo de la bandeja.
      expect(Math.abs(frente(p).x)).toBeGreaterThan(0.999)
      expect(cosenoHaciaLaCamilla(p)).toBeGreaterThan(0.999)
    }
  })
})

describe('colocarALaArsenalera: con la mesa en «Libre»', () => {
  const rejilla: { x: number; z: number }[] = []
  for (let x = -M.alcanceLibre; x <= M.alcanceLibre + 1e-9; x += 0.2) {
    for (let z = -M.alcanceLibre; z <= M.alcanceLibre + 1e-9; z += 0.2) rejilla.push({ x, z })
  }
  const giros = [0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, 2.5]

  it('arrastre la mesa adonde la arrastre, ella nunca queda sobre el colchón', () => {
    for (const giro of giros) {
      for (const punto of rejilla) {
        const mesa = colocarLaMesa('libre', { decubito: 'supino', zDeLaZona: 0, libre: punto, giroAnterior: giro })
        const p = colocarALaArsenalera(mesa)
        expect(distanciaAlColchon(p.x, p.z), `mesa en (${mesa.x.toFixed(2)}, ${mesa.z.toFixed(2)}) con giro ${giro}`).toBeGreaterThanOrEqual(MINIMO - 1e-9)
      }
    }
  })

  it('y mira siempre a su bandeja, con la camilla por delante y nunca a sus espaldas', () => {
    for (const giro of giros) {
      for (const punto of rejilla) {
        const mesa = colocarLaMesa('libre', { decubito: 'supino', zDeLaZona: 0, libre: punto, giroAnterior: giro })
        const donde = `mesa en (${mesa.x.toFixed(2)}, ${mesa.z.toFixed(2)}) con giro ${giro}`
        // Sin sitio anterior y con cada uno de los cuatro: la histéresis puede dejarla en uno que no es el más lejano.
        for (const anterior of [undefined, 'costado-a', 'costado-b', 'poste', 'punta'] as const) {
          const p = colocarALaArsenalera(mesa, anterior)
          expect(cosenoHacia(p, mesa.x, mesa.z), donde).toBeGreaterThan(0.999)
          // De frente o en diagonal, según dónde quede la mesa; de lado, a lo sumo, cuando la mesa se arrastró hasta
          // el borde de la camilla. De espaldas, nunca.
          expect(cosenoHaciaLaCamilla(p), `${donde}, venía de ${anterior}`).toBeGreaterThan(-1e-9)
        }
      }
    }
  })

  it('al pasar la mesa al otro lado de la camilla, ella pasa al otro lado: siempre por fuera', () => {
    const aLaDerecha = colocarALaArsenalera(colocarLaMesa('libre', { decubito: 'supino', zDeLaZona: 0, libre: { x: 0.9, z: 0.2 }, giroAnterior: -Math.PI / 2 }))
    const aLaIzquierda = colocarALaArsenalera(colocarLaMesa('libre', { decubito: 'supino', zDeLaZona: 0, libre: { x: -0.9, z: 0.2 }, giroAnterior: -Math.PI / 2 }))
    expect(aLaDerecha.x).toBeGreaterThan(M.medioAnchoDelColchon)
    expect(aLaIzquierda.x).toBeLessThan(-M.medioAnchoDelColchon)
  })

  it('con la mesa encima del colchón, la saca de allí en vez de dejarla donde cabe', () => {
    // La mesa de Mayo arrastrada al centro: ningún sitio junto a ella queda libre del todo.
    const mesa: ColocacionDeLaMesa = { x: 0, z: 0, giro: 0, subida: M.subidaSobreElPaciente }
    const p = colocarALaArsenalera(mesa)
    expect(distanciaAlColchon(p.x, p.z)).toBeGreaterThanOrEqual(MINIMO - 1e-9)
  })
})

describe('colocarALaArsenalera: sin saltos', () => {
  /** Los dos mejores sitios de una mesa, por su distancia al colchón. */
  function empatadas(): { mesa: ColocacionDeLaMesa; mejor: ColocacionDeLaPersona; segundo: ColocacionDeLaPersona['lado'] } | null {
    for (let x = -1.6; x <= 1.6; x += 0.05) {
      for (let z = -1.8; z <= 1.8; z += 0.05) {
        const mesa: ColocacionDeLaMesa = { x, z, giro: 0, subida: 0 }
        const mejor = colocarALaArsenalera(mesa)
        for (const otro of ['costado-a', 'costado-b', 'poste', 'punta'] as const) {
          if (otro === mejor.lado) continue
          const alOtro = colocarALaArsenalera(mesa, otro)
          // Un sitio que se queda por ser el anterior: el empate que la histéresis resuelve.
          if (alOtro.lado === otro) return { mesa, mejor, segundo: otro }
        }
      }
    }
    return null
  }

  it('si el sitio en que estaba sigue sirviendo y no pierde por mucho, se queda', () => {
    const caso = empatadas()
    expect(caso, 'no hay ninguna mesa con dos sitios casi empatados: la prueba no prueba nada').not.toBeNull()
    expect(colocarALaArsenalera(caso!.mesa, caso!.segundo).lado).toBe(caso!.segundo)
    expect(colocarALaArsenalera(caso!.mesa).lado).toBe(caso!.mejor.lado)
  })

  it('si el sitio en que estaba ya no sirve (cae sobre la camilla), lo deja aunque fuera el anterior', () => {
    // Con la mesa pegada al colchón por la derecha, su lado de adentro queda sobre él.
    const mesa = colocarLaMesa('derecha', { decubito: 'supino', zDeLaZona: 0.3 })
    const p = colocarALaArsenalera(mesa, 'costado-a')
    expect(distanciaAlColchon(p.x, p.z)).toBeGreaterThanOrEqual(MINIMO - 1e-9)
  })
})

describe('caminoAlrededorDelColchon', () => {
  const muestras = (camino: PuntoDelSuelo[]) => {
    const salida: PuntoDelSuelo[] = []
    for (let i = 1; i < camino.length; i++) {
      for (let k = 0; k <= 20; k++) {
        const t = k / 20
        salida.push({ x: camino[i - 1].x + (camino[i].x - camino[i - 1].x) * t, z: camino[i - 1].z + (camino[i].z - camino[i - 1].z) * t })
      }
    }
    return salida
  }

  it('sin colchón de por medio, va recto', () => {
    const camino = caminoAlrededorDelColchon({ x: 1.3, z: -0.5 }, { x: 1.3, z: 0.8 })
    expect(camino).toHaveLength(2)
  })

  it('de un lado de la camilla al otro, la rodea y nunca pasa sobre ella', () => {
    const desde = { x: 1.3, z: 0.2 }
    const hasta = { x: -1.3, z: 0.2 }
    const camino = caminoAlrededorDelColchon(desde, hasta)
    expect(camino.length).toBeGreaterThan(2)
    expect(camino[0]).toEqual(desde)
    expect(camino[camino.length - 1]).toEqual(hasta)
    for (const q of muestras(camino)) expect(distanciaAlColchon(q.x, q.z)).toBeGreaterThanOrEqual(MINIMO - 1e-9)
  })

  it('la rodea por el lado más corto: de los pies de un lado a los del otro, por los pies', () => {
    const camino = caminoAlrededorDelColchon({ x: 1.3, z: 1.2 }, { x: -1.3, z: 1.2 })
    // Por detrás de la cabecera serían casi tres metros más.
    expect(camino.every((q) => q.z > 0)).toBe(true)
    expect(largoDelCamino(camino)).toBeLessThan(4)
  })

  it('el camino de una esquina a la opuesta no cruza el colchón en ningún tramo', () => {
    for (const [desde, hasta] of [
      [
        { x: 1.4, z: 1.5 },
        { x: -1.4, z: -1.5 },
      ],
      [
        { x: -1.4, z: 1.5 },
        { x: 1.4, z: -1.5 },
      ],
      [
        { x: 0, z: 1.6 },
        { x: 0, z: -1.6 },
      ],
    ] as const) {
      for (const q of muestras(caminoAlrededorDelColchon(desde, hasta))) expect(distanciaAlColchon(q.x, q.z)).toBeGreaterThanOrEqual(MINIMO - 1e-9)
    }
  })
})
