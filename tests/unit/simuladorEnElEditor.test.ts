import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { OPACIDAD_DE_RAYOS_X as OPACIDAD_DEL_ATLAS } from '@/atlas/cargador'
import { OPACIDAD_DE_RAYOS_X as OPACIDAD_DEL_SIMULADOR } from '@/components/simulador/LienzoQuirurgico'
import { piezasQueFaltanEnElArchivo, reconciliarConElModelo } from '@/lib/simulador'
import { casoDesdeElFormulario, casoParaLaConsola } from '@/lib/casoQuirurgico'
import {
  aplicarColores,
  aplicarPose,
  articulacionesIniciales,
  prepararHerramienta,
} from '@/instrumental/herramienta3d'

/**
 * El simulador en el editor (D-166) y el modelo que no aparecía (O-078).
 *
 * Todo lo de aquí se puede comprobar sin navegador: son las reglas que, cuando
 * fallan, fallan callando —un lienzo en negro, un instrumento sin su pose, una
 * vista de rayos X distinta de la del taller—.
 */

describe('reconciliarConElModelo: lo declarado frente a lo que el archivo trae', () => {
  const archivo = ['Esqueleto', 'Tibia_1', 'Tibia_2']

  it('sin lista, se enseña todo y no hay nada que avisar', () => {
    expect(reconciliarConElModelo(null, archivo)).toEqual({ nodos: null, ausentes: [], sinCoincidencias: false })
  })

  it('con todo presente, se enseña lo declarado', () => {
    const r = reconciliarConElModelo(['Tibia_1', 'Tibia_2'], archivo)
    expect(r).toEqual({ nodos: ['Tibia_1', 'Tibia_2'], ausentes: [], sinCoincidencias: false })
  })

  it('con algo presente, se enseña eso y se dicen los que faltan', () => {
    const r = reconciliarConElModelo(['Tibia_1', 'Peroné_antiguo'], archivo)
    expect(r.nodos).toEqual(['Tibia_1'])
    expect(r.ausentes).toEqual(['Peroné_antiguo'])
    expect(r.sinCoincidencias).toBe(false)
  })

  it('sin NADA presente, se enseña el modelo entero y se dice (el lienzo en negro de O-078)', () => {
    // El caso real: el hueso se volvió a exportar fundido en un objeto
    // («Esqueleto») y el caso seguía declarando las piezas de la exportación
    // anterior. Antes, `mostrar` apagaba todas las mallas.
    const r = reconciliarConElModelo(['Right_capitate', 'Right_brachioradialis'], ['Esqueleto'])
    expect(r.nodos).toBeNull()
    expect(r.sinCoincidencias).toBe(true)
    expect(r.ausentes).toEqual(['Right_capitate', 'Right_brachioradialis'])
  })

  it('no repite los ausentes', () => {
    expect(reconciliarConElModelo(['X', 'X', 'Y'], archivo).ausentes).toEqual(['X', 'Y'])
  })

  it('una lista vacía no cuenta como «sin coincidencias»: no pedía nada', () => {
    expect(reconciliarConElModelo([], archivo).sinCoincidencias).toBe(false)
  })
})

describe('piezasQueFaltanEnElArchivo', () => {
  it('cuenta las que faltan y el total sin repetir', () => {
    const r = piezasQueFaltanEnElArchivo(
      [
        { nodo: 'A', rol: 'hueso' },
        { nodo: 'B', rol: 'fragmento' },
        { nodo: 'B', rol: 'hueso' },
        { nodo: '', rol: 'hueso' },
      ],
      ['A'],
    )
    expect(r).toEqual({ ausentes: ['B'], total: 2 })
  })
})

describe('los rayos X son los del taller anatómico', () => {
  it('con la misma opacidad', () => {
    // El dueño pidió que la fluoroscopia fuera **ese** RX. Si una de las dos
    // cifras cambia sin la otra, vuelven a ser dos vistas con el mismo nombre.
    expect(OPACIDAD_DEL_SIMULADOR).toBe(OPACIDAD_DEL_ATLAS)
  })
})

describe('casoDesdeElFormulario: la consola, desde lo que se está escribiendo', () => {
  const instrumentos = [
    { id: '4', nombre: 'Tijera de Mayo recta', icono: 'tijera', descripcion: 'Corta.', categoria: 'corte', modeloUrl: '/t.glb', ajustes: null },
    { id: '9', nombre: 'Pinza de Verbrugge', icono: 'pinza', descripcion: '', categoria: 'reduccion', modeloUrl: null, ajustes: null },
    { id: '12', nombre: 'Martillo', icono: 'martillo', descripcion: '', categoria: 'modelado', modeloUrl: '/m.glb', ajustes: null },
  ]
  const opciones = {
    'modelos-3d': [{ id: '1', etiqueta: 'Tibia', url: '/tibia.glb' }],
    'fases-quirurgicas': [{ id: '3', etiqueta: 'Abordaje' }],
    'huesos-ao': [{ id: '2', etiqueta: 'Tibia' }],
  }
  const valores = {
    nombre: 'Caso de prueba',
    modelo: '1',
    hueso: '2',
    ejeLargo: 'y',
    milimetrosPorUnidad: 1000,
    piezas: [{ nodo: 'Tibia_1', rol: 'fragmento' }],
    instrumental: ['12'],
    pasos: [
      { titulo: 'Cortar', objetivo: 'instrumento', instrumento: '4', fase: '3', _clave: 'c1' },
      { titulo: 'Reducir', objetivo: 'reduccion', toleranciaDesplazamiento: 3, _clave: 'c2' },
    ],
  }

  it('arma el caso con el modelo, el hueso y los pasos poblados', () => {
    const caso = casoDesdeElFormulario(valores, { opciones, instrumentos })
    expect(caso.modeloUrl).toBe('/tibia.glb')
    expect(caso.hueso).toBe('Tibia')
    expect(caso.pasos.map((p) => p.titulo)).toEqual(['Cortar', 'Reducir'])
    expect(caso.pasos[0].instrumento).toBe('4')
    expect(caso.pasos[0].instrumentoNombre).toBe('Tijera de Mayo recta')
    expect(caso.pasos[0].faseNombre).toBe('Abordaje')
  })

  it('el paso nuevo, sin identificador de la base, se identifica por su clave de fila', () => {
    const caso = casoDesdeElFormulario(valores, { opciones, instrumentos })
    expect(caso.pasos.map((p) => p.id)).toEqual(['c1', 'c2'])
  })

  it('la bandeja del editor es el catálogo entero, con marca de cuáles ya están en la del caso', () => {
    const caso = casoDesdeElFormulario(valores, { opciones, instrumentos })
    expect(caso.instrumental.map((i) => i.nombre)).toEqual([
      'Tijera de Mayo recta',
      'Pinza de Verbrugge',
      'Martillo',
    ])
    const marca = Object.fromEntries(caso.instrumental.map((i) => [i.id, i.enLaBandejaDelCaso]))
    // El 4 por que un paso lo pide; el 12 por declararse; el 9 no está.
    expect(marca).toEqual({ '4': true, '9': false, '12': true })
    expect(caso.instrumental[1].categoria).toBe('reduccion')
    expect(caso.instrumental[1].modeloUrl).toBeNull()
  })

  it('sin modelo elegido, el caso no tiene dirección (el editor pide elegirlo)', () => {
    const caso = casoDesdeElFormulario({ ...valores, modelo: '' }, { opciones, instrumentos })
    expect(caso.modeloUrl).toBeNull()
  })

  it('lo que el residente recibe de la página coincide con lo que el editor ensaya', () => {
    // La promesa de D-166: una sola traducción. Con el mismo documento poblado,
    // las piezas y los pasos salen iguales por las dos puertas.
    const poblado = {
      ...valores,
      modelo: { id: '1', url: '/tibia.glb' },
      hueso: { id: '2', nombre: 'Tibia' },
      pasos: [
        { id: 'c1', titulo: 'Cortar', objetivo: 'instrumento', instrumento: { id: '4', nombre: 'Tijera de Mayo recta' }, fase: { nombre: 'Abordaje' } },
        { id: 'c2', titulo: 'Reducir', objetivo: 'reduccion', toleranciaDesplazamiento: 3 },
      ],
    }
    const residente = casoParaLaConsola(poblado)
    const editor = casoDesdeElFormulario(valores, { opciones, instrumentos })
    expect(editor.piezas).toEqual(residente.piezas)
    expect(editor.pasos).toEqual(residente.pasos)
  })
})

describe('la pose del instrumento (herramienta3d)', () => {
  /** Una tijera mínima: un pivote que gira sobre Z con la «Apertura», y su rama. */
  function tijera() {
    const raiz = new THREE.Group()
    const pivote = new THREE.Object3D()
    pivote.name = 'pivote_rama_a'
    pivote.userData = { th: JSON.stringify({ mueve: 'Apertura', tipo: 'giro', eje: [0, 0, 1], factor: 0.5 }) }
    const rama = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.1, 0.01), new THREE.MeshStandardMaterial({ color: 0x888888 }))
    rama.name = 'rama_a'
    pivote.add(rama)
    raiz.add(pivote)
    raiz.userData = {
      th: JSON.stringify({
        instrumento: 'tijera-mayo',
        nombre: 'Tijera',
        medidas: '',
        articulaciones: [{ nombre: 'Apertura', etiqueta: 'Abrir', min: 0, max: 42, unidad: '°', inicial: 0 }],
      }),
    }
    return raiz
  }

  it('lee las articulaciones que declara el archivo', () => {
    const h = prepararHerramienta(tijera())
    expect(h.meta?.articulaciones.map((a) => a.nombre)).toEqual(['Apertura'])
    expect(articulacionesIniciales(h.meta, null)).toEqual({ Apertura: 0 })
    expect(articulacionesIniciales(h.meta, { articulaciones: { Apertura: 30 } })).toEqual({ Apertura: 30 })
  })

  it('abrir la articulación gira el pivote la mitad del valor (factor 0,5)', () => {
    const h = prepararHerramienta(tijera())
    aplicarPose(h, null, { Apertura: 40 })
    const pivote = h.nodos.get('pivote_rama_a')!
    const euler = new THREE.Euler().setFromQuaternion(pivote.quaternion)
    expect((euler.z * 180) / Math.PI).toBeCloseTo(20, 4)
    // Y volver a cero la deja donde estaba: la pose no se acumula.
    aplicarPose(h, null, { Apertura: 0 })
    expect(pivote.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6)
  })

  it('un retoque oculta una parte y la vuelve a mostrar al quitarlo', () => {
    const h = prepararHerramienta(tijera())
    aplicarPose(h, { partes: { rama_a: { ocultar: true } } }, {})
    expect(h.nodos.get('rama_a')!.visible).toBe(false)
    aplicarPose(h, null, {})
    expect(h.nodos.get('rama_a')!.visible).toBe(true)
  })

  it('un retoque de color se aplica y se deshace sin tocar el original', () => {
    const h = prepararHerramienta(tijera())
    const malla = h.nodos.get('rama_a') as THREE.Mesh
    const original = (malla.material as THREE.MeshStandardMaterial).color.getHex()
    aplicarColores(h, { partes: { rama_a: { color: '#ff0000' } } })
    expect((malla.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xff0000)
    aplicarColores(h, null)
    expect((malla.material as THREE.MeshStandardMaterial).color.getHex()).toBe(original)
  })

  it('cada malla tiene su propio material: colorear una no tiñe a las demás', () => {
    const raiz = tijera()
    const compartido = new THREE.MeshStandardMaterial({ color: 0x336699 })
    const otra = new THREE.Mesh(new THREE.BoxGeometry(), compartido)
    otra.name = 'rama_b'
    raiz.add(otra)
    ;(raiz.getObjectByName('rama_a') as THREE.Mesh).material = compartido
    const h = prepararHerramienta(raiz)
    aplicarColores(h, { partes: { rama_a: { color: '#00ff00' } } })
    expect(((h.nodos.get('rama_b') as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x336699)
  })
})
