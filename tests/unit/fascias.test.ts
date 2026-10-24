import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { corregirCatalogo } from '@/atlas/clasificacion'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import { casaConLaBusqueda, nombreEnEspanol, tieneTraduccion } from '@/atlas/nombres'

/**
 * Las fascias que hay en el atlas (P-006): lo que se exige a **cada pieza** que genera TraumaHub.
 *
 * Son pruebas de los datos escritos en `public/atlas/`, no del generador (que es Python y se prueba con
 * `scripts/atlas/fascias/probar.py`): lo que se comprueba es lo que de verdad recibe el navegador y el
 * exportador. Valen para cualquier fascia que entre —de las cinco del miembro inferior a las del cuerpo
 * entero—, y por eso no nombran ninguna: cada pieza nueva se somete a las mismas reglas.
 *
 * Se omiten, como las demás del atlas, si esta copia no tiene el atlas preparado.
 */

const ATLAS = join(process.cwd(), 'public', 'atlas')
const hay = existsSync(join(ATLAS, 'catalogo.json')) && existsSync(join(ATLAS, 'cuerpo-15.bin.gz'))
const siHay = hay ? it : it.skip

const SISTEMAS_DE_FASCIA = ['fascia-superficial', 'fascia-profunda', 'fascia-meningea', 'fascia-visceral']

/** Las parejas cuyo lado izquierdo no es el espejo del derecho: la pleura parietal y la fascia renal. */
const LADOS_CALCULADOS_POR_SEPARADO: ReadonlySet<string> = new Set(['TH0301', 'TH0303'])

const leer = () => {
  const catalogo = corregirCatalogo(JSON.parse(readFileSync(join(ATLAS, 'catalogo.json'), 'utf8')) as CatalogoDelAtlas)
  const paquete = gunzipSync(readFileSync(join(ATLAS, catalogo.paquetes[15].archivo)))
  const bufer = paquete.buffer.slice(paquete.byteOffset, paquete.byteOffset + paquete.byteLength) as ArrayBuffer
  return { catalogo, bufer, generadas: catalogo.piezas.filter((p) => p.generada) }
}

const geometria = (bufer: ArrayBuffer, p: PiezaDelAtlas) => ({
  pos: new Float32Array(bufer, p.pos, p.vertices * 3),
  nor: new Int16Array(bufer, p.nor, p.vertices * 3),
  idx: new Uint32Array(bufer, p.idx, p.indices),
})

describe('las fascias del atlas: lo que exige el catálogo a cada pieza', () => {
  siHay('hay fascias y todas están en sistemas de fascia declarados, con su color', () => {
    const { catalogo, generadas } = leer()
    expect(generadas.length).toBeGreaterThan(0)
    const sistemas = new Map(catalogo.sistemas.map((s) => [s.id, s]))
    for (const id of SISTEMAS_DE_FASCIA) {
      expect(sistemas.get(id), `el sistema ${id} del catálogo`).toBeDefined()
      expect(sistemas.get(id)!.color).toMatch(/^#[0-9a-f]{6}$/)
    }
    for (const p of generadas) expect(SISTEMAS_DE_FASCIA, p.id).toContain(p.sistema)
    // Los de BodyParts3D no cambiaron: cada sistema de origen sigue ahí.
    expect(catalogo.sistemas.filter((s) => !SISTEMAS_DE_FASCIA.includes(s.id))).toHaveLength(15)
  })

  siHay('cada una tiene la misma estructura que cualquier pieza: identificador, FMA, región y paquete', () => {
    const { catalogo, generadas } = leer()
    const regiones = new Set(catalogo.regiones.map((r) => r.id))
    const ids = new Set<string>()
    for (const p of generadas) {
      expect(p.id, 'identificador').toMatch(/^TH\d{4}M?$/)
      expect(ids.has(p.id), `${p.id} repetido`).toBe(false)
      ids.add(p.id)
      expect(p.fma, `FMA de ${p.nombre}`).toMatch(/^FMA\d+$/)
      expect(regiones.has(p.region), `región de ${p.nombre}`).toBe(true)
      // La región la fija la anatomía, no una estimación por la caja (el «~» del árbol es de lo estimado).
      expect(p.origenRegion).toBe('anatomia')
      expect(p.paquete).toBe(15)
      expect(p.vertices).toBeGreaterThan(50)
      expect(p.indices % 3).toBe(0)
    }
  })

  siHay('ninguna sale sin traducir, y la traducción dice el lado que dice el original', () => {
    const { generadas } = leer()
    for (const p of generadas) {
      expect(tieneTraduccion(p.nombre), `«${p.nombre}» sin traducción`).toBe(true)
      const es = nombreEnEspanol(p.nombre)
      expect(es).not.toBe(p.nombre)
      if (/\bright\b/i.test(p.nombre)) expect(es, p.nombre).toMatch(/derech[oa]/i)
      if (/\bleft\b/i.test(p.nombre)) expect(es, p.nombre).toMatch(/izquierd[oa]/i)
      // Se encuentran escribiendo en español y escribiendo en inglés, sin tildes.
      expect(casaConLaBusqueda(p.nombre, es.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))).toBe(true)
      expect(casaConLaBusqueda(p.nombre, p.nombre.toLowerCase())).toBe(true)
    }
  })

  siHay('las del medio del cuerpo —la fascia toracolumbar, la del cuello— no tienen par: no dicen derecha ni izquierda', () => {
    const { catalogo, generadas } = leer()
    const ids = new Set(catalogo.piezas.map((p) => p.id))
    const delMedio = generadas.filter((p) => !p.id.endsWith('M') && !/\b(right|left)\b/i.test(p.nombre))
    expect(delMedio.length).toBeGreaterThan(0)
    for (const p of delMedio) expect(ids.has(`${p.id}M`), `${p.nombre} no lleva espejo`).toBe(false)
  })

  siHay('todo lado derecho tiene su izquierdo, espejo exacto, con la `M` del atlas', () => {
    const { catalogo, generadas } = leer()
    const porId = new Map(catalogo.piezas.map((p) => [p.id, p]))
    for (const d of generadas.filter((p) => !p.id.endsWith('M') && /\b(right|left)\b/i.test(p.nombre))) {
      const i = porId.get(`${d.id}M`)
      expect(i, `la pareja izquierda de ${d.nombre}`).toBeDefined()
      expect(i!.nombre).toBe(d.nombre.replace(/\bRight\b/, 'Left').replace(/\bright\b/, 'left'))
      expect(i!.sistema).toBe(d.sistema)
      // La pleura y la fascia renal no son el espejo de su pareja: el corazón está a la izquierda y los riñones no
      // son simétricos, así que cada lado se calculó por su cuenta (D-220). Lo demás de la prueba no les toca.
      if (LADOS_CALCULADOS_POR_SEPARADO.has(d.id)) continue
      expect(i!.vertices).toBe(d.vertices)
      expect(i!.indices).toBe(d.indices)
      // La caja reflejada en X es la del otro lado.
      expect(i!.caja[0][0]).toBeCloseTo(-d.caja[1][0], 5)
      expect(i!.caja[1][0]).toBeCloseTo(-d.caja[0][0], 5)
      for (const eje of [1, 2]) {
        expect(i!.caja[0][eje]).toBeCloseTo(d.caja[0][eje], 5)
        expect(i!.caja[1][eje]).toBeCloseTo(d.caja[1][eje], 5)
      }
    }
  })

  siHay('van detrás de las de BodyParts3D, que no se movieron', () => {
    const { catalogo, generadas } = leer()
    const deOrigen = catalogo.piezas.filter((p) => !p.generada)
    expect(catalogo.piezas.slice(0, deOrigen.length)).toEqual(deOrigen)
    expect(catalogo.piezas.slice(deOrigen.length)).toEqual(generadas)
    expect(deOrigen.every((p) => p.paquete < 15)).toBe(true)
  })
})

describe('las fascias del atlas: su geometría', () => {
  siHay('los desplazamientos caen dentro del paquete y están alineados', () => {
    const { catalogo, bufer, generadas } = leer()
    expect(bufer.byteLength).toBe(catalogo.paquetes[15].bytes)
    for (const p of generadas) {
      expect(p.pos % 4, `posiciones de ${p.id}`).toBe(0)
      expect(p.nor % 2, `normales de ${p.id}`).toBe(0)
      expect(p.idx % 4, `índices de ${p.id}`).toBe(0)
      expect(p.pos + p.vertices * 12).toBeLessThanOrEqual(bufer.byteLength)
      expect(p.nor + p.vertices * 6).toBeLessThanOrEqual(bufer.byteLength)
      expect(p.idx + p.indices * 4).toBeLessThanOrEqual(bufer.byteLength)
    }
  })

  siHay('la caja del catálogo es la de la geometría, y no hay números rotos ni índices fuera de rango', () => {
    const { bufer, generadas } = leer()
    for (const p of generadas) {
      const { pos, idx } = geometria(bufer, p)
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < pos.length; i += 3) {
        for (let e = 0; e < 3; e += 1) {
          const v = pos[i + e]
          expect(Number.isFinite(v), `${p.id}: coordenada no finita`).toBe(true)
          if (v < min[e]) min[e] = v
          if (v > max[e]) max[e] = v
        }
      }
      for (let e = 0; e < 3; e += 1) {
        expect(p.caja[0][e], `${p.id} mínimo ${e}`).toBeCloseTo(min[e], 5)
        expect(p.caja[1][e], `${p.id} máximo ${e}`).toBeCloseTo(max[e], 5)
      }
      let masAlto = 0
      for (const i of idx) if (i > masAlto) masAlto = i
      expect(masAlto, `${p.id}: índice fuera de rango`).toBeLessThan(p.vertices)
    }
  })

  siHay('las normales son unitarias y miran hacia fuera (salvo el borde de un recorte)', () => {
    const { bufer, generadas } = leer()
    for (const p of generadas) {
      const { pos, nor, idx } = geometria(bufer, p)
      let unitarias = 0
      for (let i = 0; i < nor.length; i += 3) {
        const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) / 32767
        if (l > 0.98 && l < 1.02) unitarias += 1
      }
      expect(unitarias / p.vertices, `${p.id}: normales unitarias`).toBeGreaterThan(0.99)

      // Orientación: la normal de cada cara frente a la de sus vértices. Una malla al revés (la que sacó
      // el primer motor, con el 92 % hacia dentro) tiene las dos en sentidos opuestos.
      let acuerdo = 0
      let total = 0
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]]
        const u = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]]
        const w = [pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]]
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
        const dotV = (nor[a * 3] + nor[b * 3] + nor[c * 3]) * n[0] + (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1]) * n[1] + (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2]) * n[2]
        total += 1
        if (dotV > 0) acuerdo += 1
      }
      expect(acuerdo / total, `${p.id}: caras de acuerdo con sus normales`).toBeGreaterThan(0.98)
    }
  })

  siHay('pesan lo que debe: ni una pieza vacía ni un modelo imposible de cargar', () => {
    const { generadas } = leer()
    for (const p of generadas) {
      // Un retináculo del tobillo mide dos centímetros por cuatro: cuarenta triángulos ya son una banda, no una esquina.
      expect(p.indices / 3, p.id).toBeGreaterThan(40)
      expect(p.indices / 3, p.id).toBeLessThan(15000)
    }
    // El atlas entero tiene 2,27 millones de triángulos: las fascias no pueden ser otro atlas.
    const total = generadas.reduce((t, p) => t + p.indices / 3, 0)
    expect(total).toBeLessThan(400_000)
  })
})
