import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avanceValido, type AvanceDelCaso } from '@/lib/avanceDelCaso'
import { recorridoValido } from '@/lib/notaDelRecorrido'

/**
 * La evaluación sin ayudas (E4 de P-012, D-312 a D-316).
 *
 * Lo que se probaba con la mano en la consola: hasta elegir el modo, todo respondía como en práctica; en evaluación la
 * lista se ponía en verde al acertar, la escopia dibujaba dónde tenía que quedar el fragmento, «Siguiente» pasaba a la
 * mano la broca del calibre que tocaba y un clic en «Automática» reducía solo. La lista sin juicio tiene su prueba en
 * `listaDelPaso.test.ts`; aquí van el modo del recorrido, que es lógica pura, y el cableado de la consola, que no se
 * puede montar sin el lienzo y por eso se comprueba en su fuente, como en `cableadoDelProgreso.test.ts`.
 */

const leer = (...ruta: string[]) => readFileSync(join(process.cwd(), ...ruta), 'utf8')
const consola = leer('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')
const escopia = leer('src', 'components', 'simulador', 'PanelDeFluoroscopia.tsx')
const acciones = leer('src', 'app', '(frontend)', 'acciones', 'actividad.ts')
const estilos = leer('src', 'app', '(frontend)', 'simulador', 'consola.css')

/** El trozo de la consola entre dos marcas, para que una comprobación no encuentre lo que busca en otra función. */
const entre = (desde: string, hasta: string) => {
  const i = consola.indexOf(desde)
  const j = consola.indexOf(hasta, i + desde.length)
  expect(i, `no se encontró ${desde}`).toBeGreaterThanOrEqual(0)
  expect(j, `no se encontró ${hasta}`).toBeGreaterThan(i)
  return consola.slice(i, j)
}

describe('el modo queda fijo en el recorrido (D-316)', () => {
  it('el recorrido guarda su modo, y uno que no es ninguno de los dos no pasa', () => {
    expect(recorridoValido({ v: 1, modo: 'evaluacion', pasos: [] }).modo).toBe('evaluacion')
    expect(recorridoValido({ v: 1, modo: 'practica', pasos: [] }).modo).toBe('practica')
    // Uno de antes de E4 no lo trae, y no se inventa.
    expect(recorridoValido({ v: 1, pasos: [] })).not.toHaveProperty('modo')
    for (const roto of ['examen', 1, null, true]) {
      expect(() => recorridoValido({ v: 1, modo: roto, pasos: [] }), String(roto)).toThrow(/modo/)
    }
  })

  it('una evaluación no trae reducción automática: esa no salió de la consola', () => {
    const paso = { paso: 'p3', intentos: [], automatica: true }
    expect(() => recorridoValido({ v: 1, modo: 'evaluacion', pasos: [paso] })).toThrow(/evaluación/)
    expect(recorridoValido({ v: 1, modo: 'practica', pasos: [paso] }).pasos[0].automatica).toBe(true)
    // Sin modo —un recorrido de antes— se acepta como antes.
    expect(recorridoValido({ v: 1, pasos: [paso] }).pasos[0].automatica).toBe(true)
  })

  it('seguir otro día no cambia el modo: el del avance tiene que ser el de su recorrido', () => {
    const avance = (cambios: Partial<AvanceDelCaso> = {}): AvanceDelCaso => ({
      v: 1,
      paso: 2,
      modo: 'evaluacion',
      puntaje: 10,
      resueltos: ['p1'],
      fallados: [],
      complicados: [],
      automaticas: [],
      complicaciones: [],
      insumos: {},
      instantanea: { sesion: '', colocado: '' },
      guardadoEn: '2026-11-05T10:00:00.000Z',
      ...cambios,
    })
    expect(avanceValido(avance({ recorrido: { v: 1, modo: 'evaluacion', pasos: [] } }))?.recorrido?.modo).toBe('evaluacion')
    expect(() => avanceValido(avance({ recorrido: { v: 1, modo: 'practica', pasos: [] } }))).toThrow(/modo/)
    // Un avance de D-310, con recorrido sin modo, sigue valiendo.
    expect(avanceValido(avance({ recorrido: { v: 1, pasos: [] } }))?.modo).toBe('evaluacion')
  })

  it('la consola pone el modo al empezar, y el servidor guarda el del recorrido', () => {
    expect(entre('const empezarElCaso = ', 'const seguirDondeLoDejo = ')).toContain(
      'recorridoDeLaNota.current = { ...RECORRIDO_VACIO, modo: elegido }',
    )
    expect(acciones).toContain('const modo = datos.recorrido?.modo ?? datos.modo')
    expect(acciones).toContain('...(modo ? { modoDelRecorrido: modo } : {}),')
    expect(acciones).not.toContain('modoDelRecorrido: datos.modo')
  })
})

describe('nada responde hasta elegir (D-312)', () => {
  it('sin modo no hay práctica: las ayudas piden la práctica elegida', () => {
    expect(consola).toContain("const enPractica = modoDeJuego === 'practica'")
    expect(consola).not.toContain("modoDeJuego !== 'evaluacion'")
    expect(consola).toContain('const eligiendo = !editor && !modoDeJuego')
  })

  it('mientras se elige, la barra, la mesa, la columna del paso, el pie y los mandos del lienzo quedan inertes', () => {
    for (const region of [
      '<header className="consola-barra" inert={eligiendo}>',
      '<div className="consola-pasos-fila" inert={eligiendo}>',
      '<div className="consola-izq" inert={eligiendo}>',
      '<div className="consola-barra-de-modos" inert={eligiendo}>',
      '<div className="consola-lienzo-herramientas" inert={eligiendo}>',
      '<dl className="consola-medidas" inert={eligiendo}>',
      '<div className="consola-der" inert={eligiendo}>',
      '<div className="consola-pie" inert={eligiendo}>',
      'aria-label="Opciones de la herramienta" inert={eligiendo}>',
    ]) {
      expect(consola, region).toContain(region)
    }
  })

  it('la tarjeta recibe el foco al abrirse, sin mover la página, y sin aria-modal: el menú del sitio sigue', () => {
    const tarjeta = entre('{eligiendo ? (', 'consola-eleccion-tarjeta')
    expect(tarjeta).toContain('ref={tarjetaDeLaEleccion}')
    expect(tarjeta).toContain('role="dialog"')
    expect(tarjeta).toContain('tabIndex={-1}')
    expect(tarjeta).not.toContain('aria-modal')
    expect(consola).toContain('if (eligiendo) tarjetaDeLaEleccion.current?.focus({ preventScroll: true })')
    expect(estilos).toContain('.consola-eleccion:focus { outline: none; }')
  })
})

describe('en evaluación nada dice si se acierta (D-313)', () => {
  it('la lista se pide sin juicio, y el gris tiene su color y su texto para el lector de pantalla', () => {
    expect(consola).toContain('juzgar: enPractica,')
    expect(consola).toContain("': hecho, sin juzgar'")
    expect(estilos).toContain('.consola-punto-anotado > svg { color: var(--c-rotulo); }')
  })

  it('las medidas dan solo la cifra (D-329): sin el tope, el veredicto ni el color', () => {
    expect(consola).toContain('data-estado={m.lectura && enPractica ? m.lectura.estado : undefined}')
    // La línea del tope entera, detrás de la práctica: con el tope a la vista, la cifra al lado era el veredicto.
    expect(consola.match(/<dd className="consola-medida-tope">/g)).toHaveLength(1)
    expect(consola).toContain('{m.lectura && enPractica ? (\n                  <dd className="consola-medida-tope">')
    const tope = entre('<dd className="consola-medida-tope">', '</dd>')
    expect(tope).toContain('{m.lectura.referencia}')
    expect(tope).toContain('<strong>{m.lectura.veredicto}</strong>')
    // Y la instrucción completa, que los repetía en una frase.
    expect(consola).toContain('instruccionDelPaso(paso, { conTopes: enPractica })')
    expect(consola).not.toMatch(/instruccionDelPaso\(paso\)/)
  })

  it('la escopia no dibuja dónde debe quedar el fragmento ni dice si la angulación está dentro', () => {
    expect(consola).toContain('() => (enPractica ? ayudas : { ...ayudas, objetivo: false })')
    // El lienzo, el panel y el texto de la broca reciben las mismas: ninguno se queda con las de la práctica.
    expect(consola).not.toMatch(/\bayudas=\{ayudas\}/)
    expect(consola.match(/ayudas=\{ayudasDeLaEscopia\}/g)).toHaveLength(2)
    expect(consola).toContain('ayudaDeAprendizaje: ayudasDeLaEscopia.objetivo')
    expect(consola).toContain('objetivoPermitido={enPractica}')
    expect(consola).toContain("topeDeAngulacion={enPractica && objetivo === 'reduccion' && topes ? topes.angulacion : null}")
    // El interruptor se queda, apagado y con el porqué.
    expect(escopia).toContain('checked={ayudas.objetivo && objetivoPermitido}')
    expect(escopia).toContain('disabled={!hayFragmento || !objetivoPermitido}')
    expect(escopia).toContain('no se usa en evaluación')
  })
})

describe('«Siguiente» y lo que deshace, solo en práctica (D-314)', () => {
  it('en evaluación la secuencia no elige, no abre la familia ni pasa nada a la mano', () => {
    const secuencia = entre('const avanzarLaSecuencia = ', '/** La trayectoria de un tornillo')
    const corte = secuencia.indexOf('if (!enPractica) return')
    expect(corte).toBeGreaterThan(secuencia.indexOf('setEtapaDeFijacion(etapa)'))
    for (const ayuda of ['setSiguienteEnLaBandeja(siguiente.id)', 'setCategoriaAbierta(', 'elegirInstrumento(siguiente.id)']) {
      expect(secuencia.indexOf(ayuda), ayuda).toBeGreaterThan(corte)
    }
    expect(consola).toContain('const bloqueDeLaSecuencia = !enPractica ? null : (')
    expect(consola).toContain('enPractica && siguienteEnLaBandeja && siguienteEnLaBandeja !== instrumento')
    expect(consola).toContain('{enPractica && siguienteEnLaBandeja === it.id && instrumento !== it.id ? (')
    // Lo que marcó el recorrido anterior no se queda en la mesa.
    expect(entre('const empezarElCaso = ', 'const seguirDondeLoDejo = ')).toContain('setSiguienteEnLaBandeja(null)')
  })

  it('quitar agujeros y cerrar heridas, solo en práctica y en el editor', () => {
    expect(entre('{enPractica ? (', 'Quitar agujeros')).toContain('mando.current?.borrarAgujeros()')
    expect(consola).toContain('{herida.incisiones.length > 1 && enPractica ? (')
    expect(consola).toContain('{herida.capas.length > 0 && enPractica ? (')
  })

  it('en evaluación borrar el trazo no deshace la incisión, y en su paso no está', () => {
    expect(consola.match(/borrarTrazo\(true\)/g)).toHaveLength(1)
    const borrar = entre('{enPractica ? (\n                objetivo === \'trazo\' || largoDelTrazoMm > 0 ? (', 'Quitar la raya')
    expect(borrar).toContain('mando.current?.borrarTrazo(true)')
    expect(borrar).toContain("objetivo !== 'trazo' && largoDelTrazoMm > 0 ? (")
    expect(borrar).toContain('mando.current?.borrarTrazo(false)')
  })
})

describe('la reducción automática, con pregunta y que se deshace (D-315)', () => {
  it('solo en práctica y en el editor, y al residente se le pregunta', () => {
    const automatica = entre('const reducirAutomaticamente = ', 'const colocarEnDesplazamientoInicial')
    expect(automatica.indexOf('if (!enPractica) {')).toBeLessThan(automatica.indexOf('const m = mando.current'))
    const pedir = entre('const pedirLaReduccionAutomatica = ', 'reducirAutomaticamente()\n  }')
    expect(pedir).toContain('!editor &&')
    expect(pedir).toContain('aunque después lo deshaga con «Deshacer» (Ctrl+Z)')
    expect(entre('{enPractica ? (\n                    <div className="consola-instrumento-acciones" role="group" aria-label="Reducción">', '</div>')).toContain(
      'pedirLaReduccionAutomatica',
    )
  })

  it('un «Deshacer» vuelve a antes de la animación: se apila al empezar y al terminar, y no a medio camino', () => {
    const escena = entre('const alCambiarLaEscena = ', 'const pila = pilaDeDeshacer.current')
    expect(escena).toContain('if (animacionDeLaReduccion.current !== null) return')
    const automatica = entre('const reducirAutomaticamente = ', 'const colocarEnDesplazamientoInicial')
    expect(automatica.match(/apilarLaEscenaDeAhora\(\)/g)).toHaveLength(2)
    expect(automatica.indexOf('apilarLaEscenaDeAhora()')).toBeLessThan(automatica.indexOf('const cuadro = '))
    const final = automatica.slice(automatica.indexOf('animacionDeLaReduccion.current = null'))
    expect(final.indexOf('apilarLaEscenaDeAhora()')).toBeLessThan(final.indexOf('recalcularMedidas()'))
  })
})
