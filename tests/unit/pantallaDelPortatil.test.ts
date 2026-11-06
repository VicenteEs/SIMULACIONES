import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// La consola en la pantalla de un portátil (P-012 E5, puntos 1 a 3): lo que se pliega, el monitor del arco en grande y
// los relojes. Lo que aquí se mira es el cableado, que es lo que se rompe sin que falle nada: un botón que pliega una
// clase que ningún CSS lee, una tecla que ya no llega, un reloj que no se guarda. Las medidas de verdad (el 29 % del
// lienzo que pasó al 70 %, las dos tomas de 96 y 228 px que pasaron a 303) se tomaron en el navegador y están en la
// bitácora.

const raiz = join(__dirname, '..', '..', 'src')
const leer = (...partes: string[]) => readFileSync(join(raiz, ...partes), 'utf8')
const consola = leer('components', 'simulador', 'ConsolaQuirurgica.tsx')
const css = leer('app', '(frontend)', 'simulador', 'consola.css')
const plegados = leer('components', 'simulador', 'plegados.ts')
const panel = leer('components', 'simulador', 'PanelDeFluoroscopia.tsx')
const lamina = leer('components', 'simulador', 'RadiografiaPostoperatoria.tsx')
const relojes = leer('components', 'simulador', 'RelojesDeLaConsola.tsx')

/** El cuerpo de una función de la consola, desde su declaración hasta la siguiente al mismo nivel. */
const cuerpo = (inicio: string, fin: string) => {
  const desde = consola.indexOf(inicio)
  expect(desde, inicio).toBeGreaterThan(0)
  return consola.slice(desde, consola.indexOf(fin, desde + inicio.length))
}

describe('lo que se pliega', () => {
  it('se recuerda en el navegador, y sin almacenamiento vale hasta recargar', () => {
    expect(plegados).toContain('useSyncExternalStore')
    expect(plegados).toContain("window.localStorage.setItem(clave, valor ? 'si' : 'no')")
    expect(plegados).toContain('enMemoria.set(clave, valor)')
    for (const clave of ['consola.plegada.mesa', 'consola.plegada.paso', 'consola.plegada.herramienta', 'consola.instrumento.visor3d']) {
      expect(consola).toContain(`usePlegado('${clave}')`)
    }
  })

  it('las columnas plegadas son una clase que el CSS lee, y en el editor no se pliega nada', () => {
    expect(consola).toContain("${!editor && mesaPlegada ? ' izq-plegada' : ''}")
    expect(consola).toContain("${!editor && pasoPlegado ? ' der-plegada' : ''}")
    expect(css).toContain('.consola.izq-plegada { --col-izq: 52px; }')
    expect(css).toContain('.consola.der-plegada { --col-der: 52px; }')
    // `--col-*` manda sobre el ancho que deja el asa, en cada rejilla de tres columnas de la consola del residente.
    const rejillas = css.match(/grid-template-columns: var\(--col-izq, var\(--ancho-izq, \d+px\)\)/g) ?? []
    expect(rejillas.length).toBeGreaterThanOrEqual(4)
    // Las que no pasan por `--col-*` son las del editor, que no pliega: allí las columnas son su formulario.
    for (const m of css.matchAll(/grid-template-columns: var\(--ancho-izq/g)) {
      const regla = css.slice(css.lastIndexOf('}', m.index) + 1, m.index)
      expect(regla).toContain('.consola-editor')
    }
  })

  it('el foco pasa al botón que deshace lo que se acaba de hacer', () => {
    // Sin esto, plegar deja el foco en un botón que ya no está y el teclado vuelve al principio de la página.
    expect(consola).toContain('enfocarDespues(botonDesplegarLaMesa)')
    expect(consola).toContain('enfocarDespues(botonPlegarLaMesa)')
    expect(consola).toContain('enfocarDespues(botonDesplegarElPaso)')
    expect(consola).toContain('enfocarDespues(botonPlegarElPaso)')
    expect(consola).toContain('enfocarDespues(botonDeLaFicha)')
  })

  it('la pantalla baja de un portátil aprieta las barras sin tocar el móvil', () => {
    expect(css).toContain('@media (min-width: 901px) and (max-height: 820px)')
  })
})

describe('el monitor del arco en grande', () => {
  it('la M lo agranda con el arco encendido y, apagado, lo dice', () => {
    const atajo = consola.slice(consola.indexOf("if (e.key === 'm' || e.key === 'M')"), consola.indexOf("if (e.key === 'm' || e.key === 'M')") + 400)
    expect(atajo).toContain('e.preventDefault()')
    expect(atajo).toContain('setMonitorGrande((v) => !v)')
    expect(atajo).toContain('El arco está apagado')
    expect(panel).toContain('aria-keyshortcuts="M"')
  })

  it('Esc lo cierra antes de que llegue al oyente que retira la broca', () => {
    const esc = consola.slice(consola.indexOf("if (e.key === 'Escape' && monitorGrande)"), consola.indexOf("if (e.key === 'Escape' && monitorGrande)") + 300)
    expect(esc).toContain('e.stopImmediatePropagation()')
    expect(esc).toContain('setMonitorGrande(false)')
  })

  it('es el mismo recuadro con otra clase, y las dos imágenes miden lo mismo', () => {
    expect(panel).toContain("className={`consola-escopia${enGrande ? ' en-grande' : ''}`}")
    expect(consola).toContain('enGrande={monitorGrande}')
    expect(css).toContain('container-type: size;')
    expect(css).toContain('width: min(calc(50cqw - var(--e-3)), calc(100cqh - 32px));')
  })

  it('la cuenta de los rayos sale en el recuadro y vuelve a cero con el caso', () => {
    expect(panel).toContain('consola-escopia-dosis')
    expect(consola).toContain('exposicion={exposicion}')
    expect(consola).toContain('setExposicion((e) => ({ ...e, disparos: e.disparos + 1 }))')
    expect(cuerpo('const ponerLosRelojesACero = () => {', '\n  }')).toContain('setExposicion(SIN_EXPOSICION)')
  })

  it('la lámina postoperatoria se ve a pantalla completa, y su Esc no llega a la consola', () => {
    expect(lamina).toContain("document.addEventListener('keydown', alTeclear, true)")
    expect(lamina).toContain('e.stopImmediatePropagation()')
    expect(css).toContain('.radiografia-post-lamina.ampliada {')
  })
})

describe('los relojes', () => {
  it('el del procedimiento arranca con la primera incisión y se para al terminar', () => {
    expect(consola).toContain('if (e && e.capas.length > 0) arrancarElProcedimiento()')
    // La raya del bisturí en el paso de incisión no abre herida (`alHerir` no salta), y es el corte de piel para quien
    // opera: sin esta segunda vía, el reloj se quedaba en espera durante toda la incisión.
    expect(consola).toContain('if (largo > 0 && queHace.corta) arrancarElProcedimiento()')
    // El trazo avisa unas treinta veces por incisión: la guarda corta antes de llegar al `setState`.
    expect(cuerpo('const arrancarElProcedimiento = () => {', '\n  }')).toContain('relojDelProcedimiento.desde !== null')
    const terminar = cuerpo('if (indicePaso >= caso.pasos.length) {', 'return\n    }')
    expect(terminar).toContain('pararLosRelojes()')
  })

  it('un recorrido nuevo empieza con todo a cero', () => {
    expect(cuerpo('async function reiniciar() {', '\n  }\n')).toContain('ponerLosRelojesACero()')
    expect(cuerpo('const empezarElCaso = (elegido: ModoDeJuego) => {', '\n  }\n')).toContain('ponerLosRelojesACero()')
  })

  it('viajan con el resultado, con el avance de cada paso, y vuelven al seguir otro día', () => {
    expect(cuerpo('const guardarRecorrido = useCallback(', 'const huella')).toContain('tiempos: lecturaDeLosRelojes.current(')
    expect(cuerpo('empezarElPaso(siguiente, {', '})')).toContain('tiempos: lecturaDeLosRelojes.current(')
    expect(cuerpo('const seguirDondeLoDejo = () => {', '\n  }\n')).toContain('relojesGuardados(avance.tiempos)')
  })

  it('no leen el reloj al pintar: la hora viene de una ref puesta en un efecto', () => {
    const bloque = cuerpo('// ------------------------------------------------------------- los relojes', 'const lecturaDeLosRelojes')
    expect(bloque).toContain('horaDeAhora.current = () => Date.now()')

    // Fuera del efecto, ni una lectura directa (la que va entre comillas invertidas es la del comentario que lo explica).
    expect(bloque.replace('horaDeAhora.current = () => Date.now()', '')).not.toMatch(/[^`]Date\.now\(\)/)
  })

  it('el segundero repinta solo su caja, y no es una región viva', () => {
    expect(relojes).toContain('window.setInterval(() => setAhora(Date.now()), 1000)')
    expect(relojes).toContain('if (!corre) return')
    expect(relojes).not.toMatch(/aria-live|role="status"/)
    expect(consola).toContain('<RelojesDeLaConsola')
  })
})
