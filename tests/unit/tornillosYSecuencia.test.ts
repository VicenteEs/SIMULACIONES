import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ETAPAS_DE_FIJACION,
  TIPOS_DE_TORNILLO,
  definicionDelTipo,
  diametrosDelTipo,
  instrumentoDeLaEtapa,
  siguienteDeLaSecuencia,
  textoDeLaSecuencia,
  tipoDeTornilloValido,
  tipoDelTornillo,
  type QueHaceElCandidato,
} from '@/lib/tornillos'
import { colocarTornilloEnLinea, crearImplantes, medirAlLoLargoDeUnaLinea, colocarTornillo, colocarPlaca } from '@/components/simulador/implantesEnLaEscena'
import { AGUJERO_VIRGEN, calibreDeBrocaParaElTornillo, loQueFaltaPara } from '@/lib/fijacion'
import { Instrumental } from '@/collections/catalogos'
import { Instrumental as InstrumentalEsquema, camposDe } from '@/admin/esquema'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'

/**
 * Tornillos por tipo, diámetros, la secuencia brocar · medir · atornillar y la trayectoria de dos clics (P-004 E9).
 */

describe('el tipo de un tornillo', () => {
  it('el que escribió el editor manda sobre el nombre', () => {
    expect(tipoDelTornillo({ nombre: 'Tornillo cortical 3,5', tipoDeTornillo: 'esponjosa' })).toBe('esponjosa')
  })

  it('sin tipo escrito, se deduce del nombre y del identificador', () => {
    expect(tipoDelTornillo({ slug: 'tornillo-cortical-3-5', nombre: 'Tornillo cortical 3,5 mm' })).toBe('cortical')
    expect(tipoDelTornillo({ slug: 'tornillo-esponjosa-6-5', nombre: 'Tornillo de esponjosa 6,5' })).toBe('esponjosa')
    expect(tipoDelTornillo({ slug: 'tornillo-bloqueado-lcp-3-5', nombre: 'Tornillo bloqueado LCP' })).toBe('bloqueado')
    expect(tipoDelTornillo({ slug: 'tornillo-bloqueo-clavo-5-0', nombre: 'Tornillo de bloqueo de clavo' })).toBe('bloqueado')
    expect(tipoDelTornillo({ nombre: 'Tornillo de rosca parcial 4,0' })).toBe('rosca-parcial')
    expect(tipoDelTornillo({ nombre: 'Tornillo maleolar' })).toBe('rosca-parcial')
    expect(tipoDelTornillo({ nombre: 'Tornillo canulado 7,0' })).toBe('canulado')
  })

  it('con acentos y mayúsculas igual', () => {
    expect(tipoDelTornillo({ nombre: 'TORNILLO CANULADO' })).toBe('canulado')
    expect(tipoDelTornillo({ nombre: 'Tornillo de Esponjosa' })).toBe('esponjosa')
  })

  it('lo que no se reconoce es «otro»', () => {
    expect(tipoDelTornillo({ nombre: 'Tornillo raro' })).toBe('otro')
    expect(tipoDelTornillo({})).toBe('otro')
  })

  it('canulado gana a bloqueado y bloqueado a cortical: un «cortical bloqueado» es bloqueado', () => {
    expect(tipoDelTornillo({ nombre: 'Tornillo cortical bloqueado' })).toBe('bloqueado')
    expect(tipoDelTornillo({ nombre: 'Tornillo canulado bloqueado' })).toBe('canulado')
  })

  it('un tipo escrito que no existe se ignora', () => {
    expect(tipoDeTornilloValido('cortical')).toBe('cortical')
    expect(tipoDeTornilloValido('otro')).toBe('otro')
    expect(tipoDeTornilloValido('inventado')).toBeNull()
    expect(tipoDeTornilloValido(null)).toBeNull()
    expect(tipoDelTornillo({ nombre: 'Tornillo cortical', tipoDeTornillo: 'inventado' })).toBe('cortical')
  })

  it('los tipos están en el orden de los subgrupos y «otros» va al final', () => {
    expect(TIPOS_DE_TORNILLO.map((t) => t.tipo)).toEqual(['cortical', 'esponjosa', 'rosca-parcial', 'bloqueado', 'canulado', 'otro'])
  })

  it('rosca parcial declara cuánto mide la rosca (lo usa la compresión)', () => {
    expect(definicionDelTipo('rosca-parcial').roscaMm).toBe(16)
    expect(definicionDelTipo('cortical').roscaMm).toBeUndefined()
  })
})

describe('los diámetros de la lista', () => {
  it('cada tipo ofrece los suyos, de menor a mayor', () => {
    expect(diametrosDelTipo('cortical')).toEqual([2.7, 3.5, 4.5])
    expect(diametrosDelTipo('bloqueado')).toEqual([2.4, 3.5, 5])
    expect(diametrosDelTipo('otro')).toEqual([2.7, 3.5, 4, 4.5, 5, 6.5])
  })

  it('el diámetro del propio modelo siempre está en la lista', () => {
    expect(diametrosDelTipo('cortical', 5.5)).toEqual([2.7, 3.5, 4.5, 5.5])
    expect(diametrosDelTipo('cortical', 3.5)).toEqual([2.7, 3.5, 4.5])
  })

  it('un diámetro de modelo inválido no estropea la lista', () => {
    expect(diametrosDelTipo('cortical', NaN)).toEqual([2.7, 3.5, 4.5])
    expect(diametrosDelTipo('cortical', -1)).toEqual([2.7, 3.5, 4.5])
    expect(diametrosDelTipo('cortical', null)).toEqual([2.7, 3.5, 4.5])
  })

  it('la broca que se espera cambia con el diámetro elegido', () => {
    expect(calibreDeBrocaParaElTornillo(3.5)).toBe(2.5)
    expect(calibreDeBrocaParaElTornillo(4.5)).toBe(3.2)
    expect(calibreDeBrocaParaElTornillo(6.5)).toBe(3.2)
  })
})

describe('siguienteDeLaSecuencia', () => {
  it('brocar, medir, atornillar, y vuelta a brocar con el orificio ya atornillado', () => {
    expect(siguienteDeLaSecuencia(undefined, false)).toBe('brocar')
    expect(siguienteDeLaSecuencia(AGUJERO_VIRGEN, false)).toBe('brocar')
    expect(siguienteDeLaSecuencia({ perforado: { diametroMm: 2.5, profundidadMm: 20, bicortical: true }, medido: null }, false)).toBe('medir')
    expect(
      siguienteDeLaSecuencia(
        { perforado: { diametroMm: 2.5, profundidadMm: 20, bicortical: true }, medido: { espesorMm: 18, sugeridoMm: 22 } },
        false,
      ),
    ).toBe('atornillar')
    expect(
      siguienteDeLaSecuencia(
        { perforado: { diametroMm: 2.5, profundidadMm: 20, bicortical: true }, medido: { espesorMm: 18, sugeridoMm: 22 } },
        true,
      ),
    ).toBe('brocar')
  })

  it('coincide con lo que exige cada paso: se perfora antes de medir y se mide antes de atornillar', () => {
    expect(loQueFaltaPara('medir', undefined)).toBe('perforar')
    expect(loQueFaltaPara('atornillar', { perforado: { diametroMm: 2.5, profundidadMm: 1, bicortical: false }, medido: null })).toBe('medir')
  })

  it('son tres tiempos numerados del 1 al 3', () => {
    expect(ETAPAS_DE_FIJACION.map((e) => `${e.numero}·${e.etapa}`)).toEqual(['1·brocar', '2·medir', '3·atornillar'])
  })

  it('cada tiempo se dice de forma distinta', () => {
    expect(new Set(['brocar', 'medir', 'atornillar'].map((e) => textoDeLaSecuencia(e as never, true))).size).toBe(3)
  })
})

describe('instrumentoDeLaEtapa', () => {
  type C = { id: string; nombre: string; hace: QueHaceElCandidato }
  const bandeja: C[] = [
    { id: 'b25', nombre: 'Broca 2,5', hace: { perfora: true, mide: false, tornillo: false, diametroMm: 2.5 } },
    { id: 'b32', nombre: 'Broca 3,2', hace: { perfora: true, mide: false, tornillo: false, diametroMm: 3.2 } },
    { id: 'med', nombre: 'Medidor', hace: { perfora: false, mide: true, tornillo: false } },
    { id: 't35', nombre: 'Cortical 3,5', hace: { perfora: false, mide: false, tornillo: true, diametroMm: 3.5 } },
    { id: 't45', nombre: 'Cortical 4,5', hace: { perfora: false, mide: false, tornillo: true, diametroMm: 4.5 } },
    { id: 'bis', nombre: 'Bisturí', hace: { perfora: false, mide: false, tornillo: false } },
  ]
  const que = (i: C) => i.hace

  it('para medir, el medidor', () => {
    expect(instrumentoDeLaEtapa('medir', bandeja, que)?.id).toBe('med')
  })

  it('para atornillar, el último tornillo que se usó y, sin él, el primero', () => {
    expect(instrumentoDeLaEtapa('atornillar', bandeja, que, { ultimoTornilloId: 't45' })?.id).toBe('t45')
    expect(instrumentoDeLaEtapa('atornillar', bandeja, que)?.id).toBe('t35')
    expect(instrumentoDeLaEtapa('atornillar', bandeja, que, { ultimoTornilloId: 'no-esta' })?.id).toBe('t35')
  })

  it('para brocar, la broca con el calibre del último tornillo, y sin él la primera', () => {
    expect(instrumentoDeLaEtapa('brocar', bandeja, que, { diametroDelTornilloMm: 4.5 })?.id).toBe('b32')
    expect(instrumentoDeLaEtapa('brocar', bandeja, que, { diametroDelTornilloMm: 3.5 })?.id).toBe('b25')
    expect(instrumentoDeLaEtapa('brocar', bandeja, que)?.id).toBe('b25')
  })

  it('sin instrumento para ese tiempo, null', () => {
    const sinMedidor = bandeja.filter((i) => i.id !== 'med')
    expect(instrumentoDeLaEtapa('medir', sinMedidor, que)).toBeNull()
    expect(instrumentoDeLaEtapa('atornillar', [], que)).toBeNull()
  })
})

describe('la trayectoria de dos clics, con piezas de verdad', () => {
  /** Un «hueso»: un cilindro de 20 mm de diámetro a lo largo de Y. Las unidades son milímetros. */
  function escenaConHueso() {
    const escena = new THREE.Scene()
    const hueso = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 200, 32, 1, false), new THREE.MeshStandardMaterial())
    escena.add(hueso)
    escena.updateMatrixWorld(true)
    return { escena, hueso }
  }
  /** Un tornillo de 24 mm con la punta en el origen y la cabeza a +Y, en metros. */
  function plantillaDeTornillo() {
    const g = new THREE.Group()
    const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.00175, 0.00175, 0.024, 8), new THREE.MeshStandardMaterial())
    cuerpo.position.y = 0.012
    g.add(cuerpo)
    g.scale.setScalar(1000)
    return g
  }

  it('mide el hueso a lo largo de una línea cualquiera: 20 mm de lado a lado', () => {
    const { hueso } = escenaConHueso()
    // Entra por +X (sobre la cortical) y va hacia −X, atravesando todo el diámetro.
    const medida = medirAlLoLargoDeUnaLinea(new THREE.Vector3(10, 0, 0), new THREE.Vector3(-1, 0, 0), 1, [hueso])
    expect(medida).not.toBeNull()
    expect(medida!.espesorMm).toBeCloseTo(20, 1)
    expect(medida!.distanciaAlHuesoMm).toBeCloseTo(0, 0)
  })

  it('una cuerda oblicua mide lo que mide la cuerda, no el diámetro: 2·R·cos 45° = 14,1 mm', () => {
    const { hueso } = escenaConHueso()
    // Entra por (10, 0, 0) y va a 45° hacia dentro: la cuerda del círculo de radio 10 que forma 45° con la normal.
    const medida = medirAlLoLargoDeUnaLinea(new THREE.Vector3(10, 0, 0), new THREE.Vector3(-1, 0, 1).normalize(), 1, [hueso])
    expect(medida).not.toBeNull()
    expect(medida!.espesorMm).toBeCloseTo(20 * Math.cos(Math.PI / 4), 1)
  })

  it('sin hueso en el camino no mide nada', () => {
    const { hueso } = escenaConHueso()
    expect(medirAlLoLargoDeUnaLinea(new THREE.Vector3(100, 0, 0), new THREE.Vector3(1, 0, 0), 1, [hueso])).toBeNull()
  })

  it('un tornillo de tracción sin placa: 24 mm por un hueso de 20 es bicortical y asoma 4', () => {
    const { escena, hueso } = escenaConHueso()
    const implantes = crearImplantes()
    const puesto = colocarTornilloEnLinea({
      escena,
      plantilla: plantillaDeTornillo(),
      id: -1,
      entrada: new THREE.Vector3(10, 0, 0),
      haciaDentro: new THREE.Vector3(-1, 0, 0),
      largoMm: 24,
      diametroMm: 3.5,
      diametroDelModeloMm: 3.5,
      largoDelModeloMm: 24,
      bloqueado: false,
      milimetrosPorUnidad: 1,
      huesos: [hueso],
      implantes,
    })
    expect(puesto).not.toBeNull()
    expect(puesto!.libre).toBe(true)
    expect(puesto!.agujero).toBe(-1)
    expect(puesto!.bicortical).toBe(true)
    expect(puesto!.puntaFueraMm).toBeCloseTo(4, 0)
    expect(implantes.tornillos.get(-1)?.grupo.parent).toBe(escena)
  })

  it('la cabeza queda en la entrada y la punta hacia dentro, a su largo', () => {
    const { escena, hueso } = escenaConHueso()
    const implantes = crearImplantes()
    colocarTornilloEnLinea({
      escena,
      plantilla: plantillaDeTornillo(),
      id: -1,
      entrada: new THREE.Vector3(10, 0, 0),
      haciaDentro: new THREE.Vector3(-1, 0, 0),
      largoMm: 24,
      diametroMm: 3.5,
      largoDelModeloMm: 24,
      bloqueado: false,
      milimetrosPorUnidad: 1,
      huesos: [hueso],
      implantes,
    })
    const grupo = implantes.tornillos.get(-1)!.grupo
    // La punta es el origen del modelo: queda 24 mm hacia dentro de la entrada.
    expect(grupo.position.x).toBeCloseTo(10 - 24, 3)
    // La cabeza (a +Y del modelo, 24 mm) cae sobre la entrada.
    const cabeza = new THREE.Vector3(0, 24 / 1000, 0).applyMatrix4(grupo.matrixWorld)
    expect(cabeza.x).toBeCloseTo(10, 2)
    expect(cabeza.y).toBeCloseTo(0, 2)
  })

  it('un tornillo corto no llega: el aviso lo dice', () => {
    const { escena, hueso } = escenaConHueso()
    const puesto = colocarTornilloEnLinea({
      escena,
      plantilla: plantillaDeTornillo(),
      id: -2,
      entrada: new THREE.Vector3(10, 0, 0),
      haciaDentro: new THREE.Vector3(-1, 0, 0),
      largoMm: 12,
      diametroMm: 3.5,
      largoDelModeloMm: 24,
      bloqueado: false,
      milimetrosPorUnidad: 1,
      huesos: [hueso],
      implantes: crearImplantes(),
    })
    expect(puesto!.bicortical).toBe(false)
    expect(puesto!.aviso).toContain('una cortical')
  })

  it('el diámetro elegido ensancha el tornillo en proporción y no toca su largo', () => {
    const { escena, hueso } = escenaConHueso()
    const normal = colocarTornilloEnLinea({
      escena,
      plantilla: plantillaDeTornillo(),
      id: -3,
      entrada: new THREE.Vector3(10, 0, 0),
      haciaDentro: new THREE.Vector3(-1, 0, 0),
      largoMm: 24,
      diametroMm: 3.5,
      diametroDelModeloMm: 3.5,
      largoDelModeloMm: 24,
      bloqueado: false,
      milimetrosPorUnidad: 1,
      huesos: [hueso],
      implantes: crearImplantes(),
    })
    expect(normal).not.toBeNull()
    const implantes = crearImplantes()
    colocarTornilloEnLinea({
      escena,
      plantilla: plantillaDeTornillo(),
      id: -4,
      entrada: new THREE.Vector3(10, 0, 0),
      haciaDentro: new THREE.Vector3(-1, 0, 0),
      largoMm: 24,
      diametroMm: 4.5,
      diametroDelModeloMm: 3.5,
      largoDelModeloMm: 24,
      bloqueado: false,
      milimetrosPorUnidad: 1,
      huesos: [hueso],
      implantes,
    })
    const g = implantes.tornillos.get(-4)!.grupo
    expect(g.scale.x).toBeCloseTo(1000 * (4.5 / 3.5), 6)
    expect(g.scale.z).toBeCloseTo(1000 * (4.5 / 3.5), 6)
    // El largo no cambia con el ancho: 24 sobre 24 del modelo.
    expect(g.scale.y).toBeCloseTo(1000, 6)
  })

  it('con placa, el tornillo del agujero se ensancha igual y mantiene su comportamiento', () => {
    const { escena, hueso } = escenaConHueso()
    const placaPlantilla = new THREE.Group()
    placaPlantilla.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.003, 0.1), new THREE.MeshStandardMaterial()))
    placaPlantilla.scale.setScalar(1000)
    const implantes = crearImplantes()
    const placa = colocarPlaca({
      escena,
      plantilla: placaPlantilla,
      nombre: 'P',
      agujerosMm: [[0, 0]],
      punto: new THREE.Vector3(10, 0, 0),
      normal: new THREE.Vector3(1, 0, 0),
      ejeDelHueso: new THREE.Vector3(0, 1, 0),
      milimetrosPorUnidad: 1,
      huesos: [hueso],
      implantes,
    })!
    const puesto = colocarTornillo({
      escena,
      plantilla: plantillaDeTornillo(),
      placa,
      agujero: 0,
      largoMm: 30,
      diametroMm: 4.5,
      diametroDelModeloMm: 3.5,
      largoDelModeloMm: 24,
      bloqueado: false,
      huesos: [hueso],
      implantes,
    })
    expect(puesto).not.toBeNull()
    expect(puesto!.libre).toBeUndefined()
    expect(implantes.tornillos.get(0)!.grupo.scale.x).toBeCloseTo(1000 * (4.5 / 3.5), 6)
  })
})

describe('los campos y el cableado', () => {
  const fuente = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8').replace(/\r\n/g, '\n')
  const lienzo = fuente('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')
  const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')

  it('«tipoDeTornillo» está en la colección y en el panel, con las mismas opciones', () => {
    const enPayload = Instrumental.fields.find((f) => 'name' in f && f.name === 'tipoDeTornillo') as unknown as { type: string; options: { value: string }[] }
    expect(enPayload.type).toBe('select')
    const enElPanel = camposDe(InstrumentalEsquema).find((c) => c.nombre === 'tipoDeTornillo')
    expect(enElPanel?.tipo).toBe('seleccion')
    const opciones = enElPanel && 'opciones' in enElPanel ? enElPanel.opciones.map((o) => o.valor) : []
    expect(opciones).toEqual(enPayload.options.map((o) => o.value))
    // Todas las opciones son tipos que la deducción conoce.
    for (const o of opciones) expect(TIPOS_DE_TORNILLO.map((t) => t.tipo)).toContain(o)
  })

  it('el caso lleva el tipo hasta la consola', () => {
    const caso = casoParaLaConsola({
      nombre: 'Caso',
      instrumental: [{ id: 5, nombre: 'Tornillo', slug: 'tornillo-x', categoria: 'tornillos', tipoDeTornillo: 'esponjosa' }],
    })
    expect(caso.instrumental[0].tipoDeTornillo).toBe('esponjosa')
  })

  it('la migración crea el tipo y la columna, y solo eso', () => {
    const carpeta = join(process.cwd(), 'src', 'migrations')
    const nombre = readdirSync(carpeta).sort().find((n) => n.endsWith('_tipo_de_tornillo_del_instrumento.ts'))
    expect(nombre).toBeTruthy()
    const texto = readFileSync(join(carpeta, nombre as string), 'utf8')
    expect(texto).toContain(`CREATE TYPE "public"."enum_instrumental_tipo_de_tornillo" AS ENUM('cortical', 'esponjosa', 'rosca-parcial', 'bloqueado', 'canulado')`)
    expect(texto).toContain('ALTER TABLE "instrumental" ADD COLUMN "tipo_de_tornillo"')
    const subida = texto.slice(texto.indexOf('export async function up'), texto.indexOf('export async function down'))
    expect(subida).not.toMatch(/\b(UPDATE|DELETE|DROP)\b/)
  })

  it('la bandeja parte los tornillos por tipo y el último se marca «siguiente»', () => {
    expect(consola).toContain('const esUnTornillo = (i: InstrumentoDeBandeja)')
    expect(consola).toContain('consola-bandeja-subtitulo')
    expect(consola).toContain('siguienteEnLaBandeja === it.id')
  })

  it('el panel tiene el diámetro de una lista, la trayectoria y los tres tiempos', () => {
    expect(consola).toContain('aria-label="Diámetro del tornillo"')
    expect(consola).toContain('Marcar la trayectoria')
    expect(consola).toContain('aria-label="Secuencia de fijación"')
    expect(consola).toContain('Poner el siguiente en la mano')
  })

  it('al terminar un tiempo se elige y se abre el siguiente, y solo se pone en la mano si el interruptor está encendido', () => {
    const avanzar = consola.slice(consola.indexOf('const avanzarLaSecuencia = '), consola.indexOf('/** La trayectoria de un tornillo con dos clics'))
    expect(avanzar).toContain('siguienteDeLaSecuencia(delObjetivo, suceso.tipo === \'tornillo\')')
    expect(avanzar).toContain('setCategoriaAbierta(siguiente.categoria ?? null)')
    expect(avanzar).toContain('if (siguienteAutomatico) elegirInstrumento(siguiente.id)')
    expect(consola).toContain('avanzarLaSecuencia(estado, suceso)')
  })

  it('el lienzo toma la trayectoria como la de la broca, el medidor y el tornillo, salvo con un agujero de placa bajo el cursor', () => {
    expect(lienzo).toContain('if (libre && agujero === null) {')
    expect(lienzo).toContain('if (agujero === null && libre && (inst.mide || inst.coloca?.tipo === \'tornillo\')) {')
    expect(lienzo).toContain('fijarEnLaTrayectoria(libre)')
  })

  it('con «Marcar la trayectoria» encendido, el clic es la entrada o la salida en Fijar y en Perforar', () => {
    expect(lienzo).toContain('if (ultimas.current.marcandoLaTrayectoria) marcarPuntoDeLaTrayectoria()')
    const perforar = lienzo.slice(lienzo.indexOf("if (modoActual === 'perforar') {\n        // Con «Marcar la trayectoria»"), lienzo.indexOf('empezarPerforacion(golpe)\n        return'))
    expect(perforar).toContain('marcarPuntoDeLaTrayectoria()')
    expect(perforar.indexOf('marcarPuntoDeLaTrayectoria()')).toBeLessThan(perforar.indexOf('huesoBajoElCursor()'))
  })

  it('lo perforado por la trayectoria se anota en ella con el mismo orden que un agujero de placa', () => {
    expect(lienzo).toContain('if (p.libre && porLaTrayectoria) {')
    expect(lienzo).toContain("const f = loQueFaltaPara(paso, libre.estado)")
  })
})
