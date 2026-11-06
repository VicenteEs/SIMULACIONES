import {
  objetivoDelPaso,
  PASARSE_DE_LA_CORTICAL_MM,
  rangoDeFuerzaEnTexto,
  rangoDeTrazoEnTexto,
  RETRACCION_MINIMA_MM,
  topesDeReduccion,
  tornillosQuePideElFragmento,
  type Gesto,
  type Objetivo,
  type PasoQuirurgico,
} from './simulador'

/**
 * La tarjeta del paso (P-009, mejora de uso 3): una línea que dice qué hacer, la lista de lo que el paso mide con cada
 * punto marcado en vivo y, de las medidas, solo las que cuentan para lo que se mide.
 *
 * Antes la columna derecha daba un párrafo de tres o cuatro frases (`instruccionDelPaso`) y debajo del lienzo cuatro
 * cifras, se midieran o no. El residente leía el párrafo una vez, se ponía a operar y, para saber si ya podía aplicar
 * el paso, pulsaba «Aplicar paso» de sonda: el botón era la única forma de enterarse de lo que faltaba, y cada sonda
 * fallida le costaba el paso entero (`puntosDelPaso`). Con la lista a la vista cada condición se ve cumplirse mientras
 * se hace.
 *
 * Las cuentas son las de `evaluarGesto` y por eso viven aquí, junto a él, y no en la consola: dos sitios que deciden
 * «está bien» acaban diciendo cosas distintas, y una lista toda en verde que al aplicar falla es peor que no tener
 * lista. La prueba (`listaDelPaso.test.ts`) cruza las dos: con la lista entera hecha, el gesto avanza.
 */

/**
 * `hecho`: se cumple. `falta`: todavía no. `pasado`: se pasó, y aplicar ahora sería una complicación. `anotado`: solo en
 * evaluación, ya hay hecho algo de lo que el punto mide, y no se dice si está bien (E4 de P-012).
 */
export type EstadoDelPunto = 'hecho' | 'falta' | 'pasado' | 'anotado'

export interface PuntoDeLaLista {
  clave: string
  texto: string
  estado: EstadoDelPunto
  /** La cifra de ahora, si el punto mide algo: «12,5 mm», «340 N». */
  ahora?: string
}

export interface OpcionesDeLaLista {
  /**
   * Si la lista puede decir **cuál** es el instrumento del paso. En práctica sí: la demostración lo enseña igual. En
   * evaluación no, por lo mismo que `evaluarGesto` no lo dice al corregir: elegirlo es parte de lo que se evalúa.
   */
  revelarElInstrumento: boolean
  /** El nombre del instrumento del paso, para decirlo cuando se puede. */
  nombreDelInstrumento?: string | null
  /**
   * Si la lista dice si lo de ahora se acierta (E4 de P-012). En práctica sí: es para lo que existe, para que «Aplicar
   * paso» no se use de sonda. En evaluación no. Una lista que se pone en verde al acertar es una corrección en vivo, y
   * en pabellón nadie avisa de que la reducción ya vale. Ahí dice qué hay que hacer, marca en gris lo que ya tiene
   * hecho algo que medir y no enseña las cifras de ahora (`sinJuzgar`).
   */
  juzgar: boolean
}

const coma = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')

/**
 * Lo que hay que hacer, en una línea. Lo que el paso exige en cifras va en la lista y no aquí: repetido en la frase,
 * el residente leía los números dos veces y en dos formatos.
 */
export function instruccionBreve(paso: PasoQuirurgico): string {
  switch (objetivoDelPaso(paso)) {
    case 'trazo':
      return 'Trace la incisión sobre la piel con el instrumento del paso.'
    case 'reduccion':
      return 'Lleve el fragmento a su sitio y corrija la angulación.'
    case 'fuerza':
      return 'Gradúe la fuerza con el deslizador y aplique el paso.'
    case 'perforacion':
      return 'Perfore el hueso con la broca del paso, con la inclinación que pide.'
    case 'fijacion':
      return 'Apoye la placa sobre el hueso y póngale sus tornillos.'
    case 'planos':
      return paso.accionDelPlano === 'separar' ? 'Separe el músculo del paso, sin cortarlo.' : 'Corte el músculo del paso.'
    default:
      return 'Coja el instrumento del paso y aplíquelo.'
  }
}

/**
 * Las medidas de debajo del lienzo que cuentan en cada objetivo, por su nombre. La reducción también en la fijación:
 * una placa sobre un foco abierto no apoya en los dos fragmentos (`avisoDelAsiento`), y es la lectura que lo dice.
 */
export const MEDIDAS_DEL_OBJETIVO: Record<Objetivo, readonly string[]> = {
  instrumento: [],
  trazo: ['Incisión'],
  reduccion: ['Desplazamiento', 'Angulación', 'Diástasis'],
  fuerza: [],
  perforacion: [],
  fijacion: ['Desplazamiento', 'Angulación', 'Diástasis'],
  planos: [],
}

/** El punto de un rango con mínimo y máximo: por debajo falta, por encima se pasó. */
function enElRango(
  valor: number,
  minimo: number | null | undefined,
  maximo: number | null | undefined,
  vacio: boolean,
): EstadoDelPunto {
  if (vacio) return 'falta'
  if (typeof minimo === 'number' && valor < minimo) return 'falta'
  if (typeof maximo === 'number' && valor > maximo) return 'pasado'
  return 'hecho'
}

/**
 * La lista del paso con lo que el residente tiene hecho ahora mismo (el mismo `Gesto` que juzga `evaluarGesto`): en
 * práctica, cada punto juzgado; en evaluación, sin juzgar (`juzgar`).
 */
export function listaDelPaso(paso: PasoQuirurgico, gesto: Gesto, opciones: OpcionesDeLaLista): PuntoDeLaLista[] {
  const lista = listaJuzgada(paso, gesto, opciones)
  if (opciones.juzgar) return lista
  // Se rehace cada punto desde su clave, y no se copia lo demás: un `estado` o un `ahora` que se colaran de la lista
  // juzgada acabarían en el texto oculto para el lector de pantalla, que también se lee.
  return lista.map(({ clave, texto }) => ({ clave, texto, estado: sinJuzgar(clave, paso, gesto) ? 'anotado' : 'falta' }))
}

/**
 * En evaluación, si un punto ya tiene hecho algo que medir (E4 de P-012): la incisión trazada, la perforación, la placa,
 * los tornillos, el músculo elegido. Es la acción y no si salió bien: el punto del calibre se marca con cualquier broca.
 *
 * La reducción y la fuerza no se marcan nunca. Se miden desde que empieza el paso, con el trozo sin tocar y el
 * deslizador en su sitio, y no hay un gesto que diga «ya lo hice» sin decir también si quedó dentro.
 */
function sinJuzgar(clave: string, paso: PasoQuirurgico, gesto: Gesto): boolean {
  const f = gesto.fijacion
  switch (clave) {
    case 'instrumento':
      return !!gesto.instrumento
    case 'trazo':
      return (gesto.trazo ?? 0) > 0
    case 'perforar':
    case 'calibre':
    case 'angulo':
    case 'bicortical':
    case 'sinPasarse':
      return !!gesto.perforacion
    case 'placa':
      return !!f && (f.placa || (!!paso.exigeCompresion && f.tornillos > 0))
    case 'tornillos':
    case 'porFragmento':
    case 'bicorticales':
    case 'largos':
    case 'compresion':
      return (f?.tornillos ?? 0) > 0
    case 'musculo':
      return !!gesto.plano?.nodo && gesto.plano.accion === (paso.accionDelPlano === 'separar' ? 'separar' : 'cortar')
    case 'retraido':
      return (gesto.plano?.retraidoMm ?? 0) > 0
    case 'cortado':
      return !!gesto.plano?.cortado
    default:
      return false
  }
}

function listaJuzgada(paso: PasoQuirurgico, gesto: Gesto, opciones: OpcionesDeLaLista): PuntoDeLaLista[] {
  const lista: PuntoDeLaLista[] = []
  const nombre = opciones.nombreDelInstrumento?.trim()
  if (paso.instrumento && opciones.revelarElInstrumento) {
    // Sin nombre —el instrumento del paso no está en el instrumental del caso— la lista seguía con «Un instrumento en la
    // mano» y se ponía en verde con cualquiera, también en práctica (E4 de P-012): un verde que decía que valía lo que no.
    lista.push({
      clave: 'instrumento',
      texto: nombre ? `En la mano: ${nombre}` : 'El instrumento del paso en la mano',
      estado: gesto.instrumento === paso.instrumento ? 'hecho' : 'falta',
    })
  } else {
    lista.push({ clave: 'instrumento', texto: 'Un instrumento en la mano', estado: gesto.instrumento ? 'hecho' : 'falta' })
  }

  switch (objetivoDelPaso(paso)) {
    case 'trazo': {
      const largo = gesto.trazo ?? 0
      const rango = rangoDeTrazoEnTexto(paso)
      lista.push({
        clave: 'trazo',
        texto: rango ? `Incisión de ${rango}` : 'Una incisión trazada',
        estado: enElRango(largo, paso.trazoMinimo, paso.trazoMaximo, largo <= 0),
        ahora: largo > 0 ? `${coma(largo)} mm` : undefined,
      })
      break
    }
    case 'reduccion': {
      const topes = topesDeReduccion(paso)
      const l = gesto.lectura ?? null
      const porPlano = topes.coronal !== null && topes.sagital !== null && topes.rotacion !== null
      // Las mismas cifras que juzga `reduccionFueraDeLosTopes` (D-305): con la lectura y topes por plano, el giro va
      // plano a plano; con un tope de acortamiento propio, lo de a lo largo se parte en los dos sentidos.
      const angulos: [string, string, number | undefined, number, string][] =
        porPlano && l
          ? [
              ['coronal', 'Plano coronal (varo o valgo)', Math.abs(l.valgo), topes.coronal!, '°'],
              ['sagital', 'Plano sagital', Math.abs(l.recurvatum), topes.sagital!, '°'],
              ['rotacion', 'Rotación', Math.abs(l.rotacion), topes.rotacion!, '°'],
            ]
          : [['angulacion', 'Angulación', gesto.angulacion, porPlano ? Math.min(topes.coronal!, topes.sagital!, topes.rotacion!) : topes.angulacion, '°']]
      const aLoLargo: [string, string, number | undefined, number, string][] =
        l && topes.acortamiento !== topes.diastasis
          ? [
              ['diastasis', 'Diástasis', Math.max(0, l.axial), topes.diastasis, 'mm'],
              ['acortamiento', 'Acortamiento', Math.max(0, -l.axial), topes.acortamiento, 'mm'],
            ]
          : [['diastasis', 'Diástasis', gesto.diastasis, Math.min(topes.diastasis, topes.acortamiento), 'mm']]
      const cifras: [string, string, number | undefined, number, string][] = [
        ['desplazamiento', 'Desplazamiento', gesto.desplazamiento, topes.desplazamiento, 'mm'],
        ...angulos,
        ...aLoLargo,
      ]
      for (const [clave, texto, valor, tope, unidad] of cifras) {
        const medido = typeof valor === 'number' && Number.isFinite(valor)
        lista.push({
          clave,
          texto: `${texto} hasta ${coma(tope)}${unidad === '°' ? '°' : ` ${unidad}`}`,
          estado: medido && valor <= tope ? 'hecho' : 'falta',
          ahora: medido ? `${coma(valor)}${unidad === '°' ? '°' : ` ${unidad}`}` : undefined,
        })
      }
      break
    }
    case 'fuerza': {
      const fuerza = gesto.fuerza ?? 0
      const rango = rangoDeFuerzaEnTexto(paso)
      lista.push({
        clave: 'fuerza',
        texto: rango ? `Fuerza de ${rango}` : 'La fuerza graduada',
        estado: enElRango(fuerza, paso.fuerzaMinima, paso.fuerzaMaxima, false),
        ahora: `${Math.round(fuerza)} N`,
      })
      break
    }
    case 'perforacion': {
      const p = gesto.perforacion
      lista.push({ clave: 'perforar', texto: 'Una perforación en el hueso', estado: p ? 'hecho' : 'falta' })
      if (typeof paso.calibreBroca === 'number') {
        lista.push({
          clave: 'calibre',
          texto: `Broca de Ø ${coma(paso.calibreBroca)} mm`,
          estado: p && Math.abs(p.diametroMm - paso.calibreBroca) <= 0.05 ? 'hecho' : 'falta',
          ahora: p ? `Ø ${coma(p.diametroMm)} mm` : undefined,
        })
      }
      if (typeof paso.anguloMinimo === 'number' || typeof paso.anguloMaximo === 'number') {
        const minimo = typeof paso.anguloMinimo === 'number' ? paso.anguloMinimo : 0
        const maximo = typeof paso.anguloMaximo === 'number' ? paso.anguloMaximo : 180
        lista.push({
          clave: 'angulo',
          texto: `Entre ${Math.round(minimo)}° y ${Math.round(maximo)}° con el eje del hueso`,
          estado: p && p.anguloConElEje >= minimo && p.anguloConElEje <= maximo ? 'hecho' : 'falta',
          ahora: p ? `${Math.round(p.anguloConElEje)}°` : undefined,
        })
      }
      if (paso.exigeBicortical) {
        lista.push({ clave: 'bicortical', texto: 'Que cruce las dos corticales', estado: p?.bicortical ? 'hecho' : 'falta' })
      }
      lista.push({
        clave: 'sinPasarse',
        texto: `Sin pasar más de ${PASARSE_DE_LA_CORTICAL_MM} mm la cortical opuesta`,
        estado: !p ? 'falta' : p.sePasoMm > PASARSE_DE_LA_CORTICAL_MM ? 'pasado' : 'hecho',
        ahora: p && p.sePasoMm > 0 ? `${coma(p.sePasoMm)} mm` : undefined,
      })
      break
    }
    case 'fijacion': {
      const f = gesto.fijacion
      const necesarios = paso.tornillosMinimos ?? 1
      const tornillos = f?.tornillos ?? 0
      lista.push({
        clave: 'placa',
        texto: paso.exigeCompresion ? 'Una placa sobre el hueso, o un tornillo de tracción' : 'Una placa sobre el hueso',
        estado: f && (f.placa || (paso.exigeCompresion && tornillos > 0)) ? 'hecho' : 'falta',
      })
      lista.push({
        clave: 'tornillos',
        texto: `${necesarios} ${necesarios === 1 ? 'tornillo' : 'tornillos'} como mínimo`,
        estado: tornillos >= necesarios ? 'hecho' : 'falta',
        ahora: `${tornillos} de ${necesarios}`,
      })
      // Por fragmento principal (D-309), con lo que pide cada uno. Solo aparece con la placa asentada sobre una
      // fractura, que es cuando el gesto trae con qué contarlo: antes, un punto que no se puede cumplir dejaría la lista
      // en rojo en un caso sin fractura.
      const porFragmento = paso.tornillosPorFragmento === 0 ? undefined : f?.porFragmento
      if (porFragmento) {
        const cruza = porFragmento.length >= 2
        lista.push({
          clave: 'porFragmento',
          texto: 'Los suyos en cada fragmento principal',
          estado: cruza && porFragmento.every((t) => t.tornillos >= tornillosQuePideElFragmento(paso, t)) ? 'hecho' : 'falta',
          ahora: cruza
            ? porFragmento.map((t) => `${t.nombre}, ${t.tornillos} de ${tornillosQuePideElFragmento(paso, t)}`).join(' · ')
            : 'la placa no cruza la fractura',
        })
      }
      if (paso.exigeBicortical) {
        lista.push({
          clave: 'bicorticales',
          texto: 'Todos bicorticales',
          estado: f && tornillos > 0 && f.bicorticales >= tornillos ? 'hecho' : 'falta',
          ahora: tornillos > 0 ? `${f?.bicorticales ?? 0} de ${tornillos}` : undefined,
        })
      }
      lista.push({
        clave: 'largos',
        texto: 'Ningún tornillo largo',
        estado: (f?.largos ?? 0) > 0 ? 'pasado' : tornillos > 0 ? 'hecho' : 'falta',
        ahora: (f?.largos ?? 0) > 0 ? `${f?.largos} largos` : undefined,
      })
      if (paso.exigeCompresion) {
        lista.push({
          clave: 'compresion',
          texto: 'Que comprima la fractura',
          estado: (f?.compresionMm ?? 0) > 0 ? 'hecho' : 'falta',
          ahora: (f?.compresionMm ?? 0) > 0 ? `${coma(f?.compresionMm ?? 0)} mm` : undefined,
        })
      }
      break
    }
    case 'planos': {
      const separar = paso.accionDelPlano === 'separar'
      const p = gesto.plano
      const accion = separar ? 'separar' : 'cortar'
      // En evaluación el punto se marca con cualquier músculo elegido para esa acción: con el del paso, la marca diría
      // cuál era.
      const elegido = !!p?.nodo && p.accion === accion && (!opciones.revelarElInstrumento || p.nodo === (paso.musculoDelPlano ?? ''))
      lista.push({
        clave: 'musculo',
        texto: `El músculo del paso, con «${separar ? 'Separar' : 'Cortar'}»`,
        estado: elegido ? 'hecho' : 'falta',
      })
      if (separar) {
        const mm = p?.retraidoMm ?? 0
        lista.push({
          clave: 'retraido',
          texto: `Retraído al menos ${RETRACCION_MINIMA_MM} mm`,
          estado: elegido && mm >= RETRACCION_MINIMA_MM ? 'hecho' : 'falta',
          ahora: mm > 0 ? `${Math.round(mm)} mm` : undefined,
        })
      } else {
        lista.push({ clave: 'cortado', texto: 'Cortado', estado: elegido && p?.cortado ? 'hecho' : 'falta' })
      }
      break
    }
    default:
      break
  }
  return lista
}
