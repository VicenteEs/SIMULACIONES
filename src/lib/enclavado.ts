import { juzgarElBloqueo, type OrificioDelClavo, type Punteria } from './bloqueoDelClavo'

/**
 * El enclavado endomedular, paso a paso (P-005 E4): punto de entrada, guía de punta de oliva, dedo reductor, fresado y cambio de guía.
 *
 * El orden real, que es lo que esta pieza hace cumplir, es: **entrada → guía a través del foco → fresado progresivo → cambio de la guía
 * por el tubo de intercambio → clavo** (el clavo y su inserción son de E5). Cada paso depende del anterior: la guía no pasa sin entrada, no se
 * fresa sin la guía pasada, y el clavo no entra sin fresar.
 *
 * Como `fijacion.ts` y `alambreDeKirschner.ts`, está aparte del lienzo y sin `three`: la geometría la pone la escena, pero **lo que significa**
 * —si una entrada es buena, cuándo se atasca una guía, cuánto hay que fresar— son reglas que se prueban con números. Las cifras son una
 * propuesta de partida, pensada para la tibia, que el traumatólogo debe revisar: están todas en las constantes de abajo.
 */

// ------------------------------------------------------------------------------------------------ constantes

/** Calibre de la guía de punta de oliva, en mm. */
export const DIAMETRO_DE_LA_GUIA_MM = 3
/** Ancho del canal medular en el istmo, en mm. Es el de una tibia de adulto; sirve de partida cuando el caso no lo dice. */
export const ISTMO_POR_OMISION_MM = 11

/** Hasta dónde llega la entrada ideal desde el extremo proximal del hueso, en mm (tibia: justo por delante de la meseta, sobre el tubérculo). */
export const ENTRADA_IDEAL_DESDE_EL_EXTREMO_MM = 25
/** Más lejos que esto del extremo, la entrada ya no sirve: el clavo saldría por la cortical posterior. */
export const ENTRADA_ACEPTABLE_DESDE_EL_EXTREMO_MM = 40
/** Lo que puede desviarse la entrada de la línea del canal en el plano frontal y seguir siendo ideal, en mm. */
export const DESVIACION_IDEAL_MM = 5
/** Más desviada que esto, el clavo se va hacia un lado (valgo o varo de la fractura). */
export const DESVIACION_ACEPTABLE_MM = 10

/** Cuánto asoma la guía por la cara de entrada: es lo que se agarra, en mm. Solo para dibujarla. */
export const LARGO_DE_LA_GUIA_MM = 1000
/** Hasta cuánto antes del extremo distal del hueso se deja la punta de la guía, en mm: en la epífisis y sin tocar la articulación. */
export const MARGEN_DISTAL_DE_LA_GUIA_MM = 10

/** Desplazamiento máximo entre los canales de los dos fragmentos para que la guía los encuentre sola, en mm: la mitad del istmo. */
export const DESPLAZAMIENTO_QUE_PASA_MM = ISTMO_POR_OMISION_MM / 2
/** Con el dedo reductor empujando el canal distal hacia la línea, se pasa un poco más. */
export const DESPLAZAMIENTO_QUE_PASA_CON_DEDO_MM = 9
/** Angulación máxima del foco para que la guía siga el canal, en grados. */
export const ANGULACION_QUE_PASA_GRADOS = 15
export const ANGULACION_QUE_PASA_CON_DEDO_GRADOS = 25

/** Las cabezas de fresa, de 0,5 en 0,5 mm. */
export const CABEZAS_DE_FRESA_MM: readonly number[] = [8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13]
/** Salto máximo entre una cabeza y la siguiente: más calienta el hueso y sube la presión dentro del canal. */
export const SALTO_MAXIMO_DE_FRESA_MM = 1
/** Cuánto más ancho que el clavo se fresa: de 1 a 1,5 mm. */
export const MARGEN_MINIMO_DEL_FRESADO_MM = 1
export const MARGEN_MAXIMO_DEL_FRESADO_MM = 2

// ------------------------------------------------------------------------------------------------ la entrada

export interface JuicioDeLaEntrada {
  buena: boolean
  aviso: string | null
}

/**
 * Juzga el punto de entrada. `desdeElExtremoMm` es lo que hay del extremo proximal del hueso al punto, a lo largo del eje; `desviacionMm` cuánto se
 * aparta de la línea del canal en el plano frontal; `anteriorMm`, hacia delante (positivo) o hacia atrás de esa línea. Se pone en la cara anterior: una
 * entrada posterior no es una entrada.
 */
export function juzgarLaEntrada(p: { desdeElExtremoMm: number; desviacionMm: number; anteriorMm: number }): JuicioDeLaEntrada {
  const f = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
  if (p.anteriorMm <= 0) {
    return { buena: false, aviso: 'La entrada está en la cara posterior: el clavo se pone por delante, sobre la cara anterior del extremo proximal.' }
  }
  if (p.desdeElExtremoMm > ENTRADA_ACEPTABLE_DESDE_EL_EXTREMO_MM) {
    return {
      buena: false,
      aviso: `La entrada está a ${f(p.desdeElExtremoMm)} mm del extremo proximal: demasiado distal, el clavo toparía con la cortical posterior. Suba hasta unos ${ENTRADA_IDEAL_DESDE_EL_EXTREMO_MM} mm.`,
    }
  }
  if (p.desviacionMm > DESVIACION_ACEPTABLE_MM) {
    return {
      buena: false,
      aviso: `La entrada se aparta ${f(p.desviacionMm)} mm de la línea del canal: el clavo se iría hacia un lado y la fractura quedaría en valgo o en varo. Debe estar en línea con el canal.`,
    }
  }
  if (p.desdeElExtremoMm > ENTRADA_IDEAL_DESDE_EL_EXTREMO_MM || p.desviacionMm > DESVIACION_IDEAL_MM) {
    return { buena: true, aviso: `Entrada aceptable, pero no ideal (${f(p.desdeElExtremoMm)} mm del extremo y ${f(p.desviacionMm)} mm fuera de la línea del canal): revise la fluoroscopia antes de seguir.` }
  }
  return { buena: true, aviso: null }
}

// ------------------------------------------------------------------------------------------------ la guía

/** Cómo está el foco, tal como lo mide la consola. */
export interface ReduccionDelFoco {
  desplazamientoMm: number
  angulacionGrados: number
}

export interface JuicioDelPaso {
  pasa: boolean
  aviso: string | null
}

/**
 * ¿Pasa la guía por el foco? Los canales de los dos fragmentos tienen que estar a menos de la mitad del istmo uno del otro, y el eje, en línea;
 * con el **dedo reductor** puesto, que empuja el canal del fragmento hacia la guía, se admite algo más. Si no, la punta de oliva se apoya en la
 * cortical del otro fragmento y se atasca: forzarla la saca del hueso.
 */
export function juzgarElPasoDeLaGuia(r: ReduccionDelFoco, conDedo: boolean): JuicioDelPaso {
  const maximo = conDedo ? DESPLAZAMIENTO_QUE_PASA_CON_DEDO_MM : DESPLAZAMIENTO_QUE_PASA_MM
  const angulo = conDedo ? ANGULACION_QUE_PASA_CON_DEDO_GRADOS : ANGULACION_QUE_PASA_GRADOS
  const f = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
  if (r.desplazamientoMm > maximo) {
    return {
      pasa: false,
      aviso: `La guía se atasca en el foco: los canales están desalineados ${f(r.desplazamientoMm)} mm (pasa con menos de ${f(maximo)} mm).${conDedo ? ' Reduzca mejor.' : ' Reduzca mejor o ayude con el dedo reductor.'}`,
    }
  }
  if (r.angulacionGrados > angulo) {
    return { pasa: false, aviso: `La guía no sigue el canal: el foco está angulado ${f(r.angulacionGrados)}° (pasa con menos de ${f(angulo)}°). Corrija la angulación.` }
  }
  return { pasa: true, aviso: null }
}

/**
 * Hasta dónde avanza la guía, en mm desde la entrada. Si no pasa el foco, se detiene en él (`distanciaAlFocoMm`); si pasa, llega hasta
 * `MARGEN_DISTAL_DE_LA_GUIA_MM` del extremo distal, donde se deja la punta.
 */
export function avanceMaximoDeLaGuia(p: { largoDelCanalMm: number; distanciaAlFocoMm: number | null; pasa: boolean }): number {
  const hasta = Math.max(0, p.largoDelCanalMm - MARGEN_DISTAL_DE_LA_GUIA_MM)
  if (p.distanciaAlFocoMm === null || p.pasa) return hasta
  return Math.min(hasta, Math.max(0, p.distanciaAlFocoMm))
}

/** Dónde quedó la punta de la guía respecto del foco y del extremo distal: lo que importa para fresar. */
export function guiaPasada(p: { avanceMm: number; distanciaAlFocoMm: number | null; largoDelCanalMm: number }): { cruzaElFoco: boolean; llegaAlFondo: boolean } {
  const cruza = p.distanciaAlFocoMm === null ? p.avanceMm > 0 : p.avanceMm > p.distanciaAlFocoMm + 5
  return { cruzaElFoco: cruza, llegaAlFondo: cruza && p.avanceMm >= p.largoDelCanalMm - MARGEN_DISTAL_DE_LA_GUIA_MM - 1 }
}

// ------------------------------------------------------------------------------------------------ el fresado

export interface JuicioDelFresado {
  /** El canal quedó listo para el clavo (si se sabe cuál): al menos su calibre más el margen. */
  listo: boolean
  /** La cabeza más grande que pasó. */
  mayorMm: number
  aviso: string | null
}

/**
 * Juzga el fresado: `cabezasMm` son las cabezas que pasaron, en el orden en que pasaron. Se empieza por una cabeza pequeña, se sube de 0,5 en 0,5
 * (un salto de más de 1 mm calienta el hueso y sube la presión) hasta quedar 1 a 1,5 mm sobre el calibre del clavo, y no se pasa de ahí: fresar de más
 * adelgaza las corticales y le quita al clavo el apoyo que lo estabiliza. Sin clavo conocido, se juzga solo el modo de subir.
 */
export function juzgarElFresado(cabezasMm: readonly number[], clavoMm: number | null, istmoMm = ISTMO_POR_OMISION_MM): JuicioDelFresado {
  const f = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
  if (cabezasMm.length === 0) return { listo: false, mayorMm: 0, aviso: null }
  const mayor = Math.max(...cabezasMm)
  if (cabezasMm[0] > istmoMm - 1) {
    return { listo: false, mayorMm: mayor, aviso: `Se empezó con una cabeza de ${f(cabezasMm[0])} mm, demasiado grande para el istmo (${f(istmoMm)} mm): se empieza con la más chica (${f(CABEZAS_DE_FRESA_MM[0])} mm) y se sube.` }
  }
  for (let i = 1; i < cabezasMm.length; i++) {
    if (cabezasMm[i] - cabezasMm[i - 1] > SALTO_MAXIMO_DE_FRESA_MM + 1e-9) {
      return {
        listo: false,
        mayorMm: mayor,
        aviso: `Se pasó de ${f(cabezasMm[i - 1])} a ${f(cabezasMm[i])} mm: un salto de más de ${f(SALTO_MAXIMO_DE_FRESA_MM)} mm calienta el hueso y sube la presión dentro del canal. Suba de 0,5 en 0,5 mm.`,
      }
    }
  }
  if (clavoMm === null) return { listo: false, mayorMm: mayor, aviso: null }
  if (mayor < clavoMm + MARGEN_MINIMO_DEL_FRESADO_MM - 1e-9) {
    return { listo: false, mayorMm: mayor, aviso: `Falta fresar: para un clavo de ${f(clavoMm)} mm se llega a ${f(clavoMm + MARGEN_MINIMO_DEL_FRESADO_MM)} mm como mínimo y se lleva ${f(mayor)} mm.` }
  }
  if (mayor > clavoMm + MARGEN_MAXIMO_DEL_FRESADO_MM + 1e-9) {
    return { listo: true, mayorMm: mayor, aviso: `Se fresó hasta ${f(mayor)} mm para un clavo de ${f(clavoMm)} mm: de más. Adelgaza la cortical y el clavo queda flojo en el canal.` }
  }
  return { listo: true, mayorMm: mayor, aviso: null }
}

/** La cabeza que sigue a la última que pasó: la primera si no pasó ninguna. `null` si ya no hay más. */
export function siguienteCabeza(cabezasMm: readonly number[]): number | null {
  if (cabezasMm.length === 0) return CABEZAS_DE_FRESA_MM[0]
  const ultima = cabezasMm[cabezasMm.length - 1]
  return CABEZAS_DE_FRESA_MM.find((c) => c > ultima + 1e-9) ?? null
}

// ------------------------------------------------------------------------------------------------ el clavo previsto

/** «Clavo tibial 9 × 330 mm» → { diametroMm: 9, largoMm: 330 }; `null` si el nombre no los dice. */
export function medidasDelClavoEnElNombre(nombre: string): { diametroMm: number; largoMm: number } | null {
  const m = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*mm/i.exec(nombre)
  if (!m) return null
  const diametroMm = Number(m[1].replace(',', '.'))
  const largoMm = Number(m[2].replace(',', '.'))
  if (!(diametroMm > 0 && diametroMm < 25) || !(largoMm > 100 && largoMm < 600)) return null
  return { diametroMm, largoMm }
}

/** Por orden de preferencia: para la diáfisis de un fémur se prefiere el femoral al cefalomedular, que es de la región trocantérea. */
const CLAVO_DE_CADA_HUESO: readonly { hueso: RegExp; clavos: readonly RegExp[] }[] = [
  { hueso: /tibi/i, clavos: [/tibi/i] },
  { hueso: /f[eé]mur|femor/i, clavos: [/femor|f[eé]mur/i, /cefalomedular|pfn/i] },
  { hueso: /h[uú]mer/i, clavos: [/h[uú]mer/i] },
]

/**
 * El clavo que se va a poner, de entre los nombres de la bandeja: el que corresponde al hueso del caso («Tibia (diáfisis)» → el tibial) y, si ninguno
 * corresponde o el caso no dice el hueso, el primero que traiga sus medidas. Sin él el fresado no sabe hasta cuánto llegar, y con el equivocado —un
 * clavo femoral en una tibia— lo juzgaría contra otro calibre.
 */
export function clavoPrevisto(nombres: readonly string[], hueso: string | null): { diametroMm: number; largoMm: number } | null {
  const conMedidas = nombres.filter((n) => /clavo/i.test(n)).flatMap((n) => {
    const m = medidasDelClavoEnElNombre(n)
    return m ? [{ nombre: n, ...m }] : []
  })
  const regla = hueso ? CLAVO_DE_CADA_HUESO.find((r) => r.hueso.test(hueso)) : undefined
  let suyo: (typeof conMedidas)[number] | undefined
  for (const clavo of regla?.clavos ?? []) {
    suyo = conMedidas.find((c) => clavo.test(c.nombre))
    if (suyo) break
  }
  const elegido = suyo ?? conMedidas[0]
  return elegido ? { diametroMm: elegido.diametroMm, largoMm: elegido.largoMm } : null
}

// ------------------------------------------------------------------------------------------------ el clavo (P-005 E5)

/** Cuánto entra el clavo empujándolo con la mano, antes de empezar a golpear, en mm. */
export const ENTRADA_A_MANO_MM = 40
/** Holgura mínima entre el canal fresado y el clavo para que entre: por debajo de medio milímetro, no entra. */
export const HOLGURA_QUE_NO_ENTRA_MM = 0.5
/** Lo que avanza el clavo con cada golpe, según la holgura: suelto o justo. */
export const AVANCE_POR_GOLPE_SUELTO_MM = 8
export const AVANCE_POR_GOLPE_JUSTO_MM = 3
/** Cuánto puede quedar hundido el extremo proximal del clavo bajo la cortical de entrada, en mm: más cuesta sacarlo si hay que retirarlo. */
export const HUNDIDO_MAXIMO_MM = 10
/** Distancia deseable entre la punta del clavo y el extremo distal del canal, en mm: la punta en la metáfisis y sin tocar la articulación. */
export const SOBRA_MINIMA_DEL_CLAVO_MM = 10
export const SOBRA_MAXIMA_DEL_CLAVO_MM = 40

export interface JuicioDelCalibreDelClavo {
  entra: boolean
  holguraMm: number
  aviso: string | null
}

/** ¿Cabe el clavo en el canal que se fresó? Con menos de medio milímetro de holgura se atasca: hay que fresar más, no golpear más fuerte. */
export function juzgarElCalibreDelClavo(clavoMm: number, fresadoMm: number): JuicioDelCalibreDelClavo {
  const f = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
  const holguraMm = fresadoMm - clavoMm
  if (fresadoMm <= 0) return { entra: false, holguraMm, aviso: 'El canal no está fresado: el clavo no entra.' }
  if (holguraMm < HOLGURA_QUE_NO_ENTRA_MM) {
    return {
      entra: false,
      holguraMm,
      aviso: `El canal fresado a ${f(fresadoMm)} mm no deja pasar un clavo de ${f(clavoMm)} mm: se atasca. Fresar hasta ${f(clavoMm + MARGEN_MINIMO_DEL_FRESADO_MM)} mm como mínimo.`,
    }
  }
  if (holguraMm < MARGEN_MINIMO_DEL_FRESADO_MM) {
    return {
      entra: true,
      holguraMm,
      aviso: `Entra apretado (${f(holguraMm)} mm de holgura): cada golpe avanza poco y se corre el riesgo de fracturar el hueso. Lo habitual es fresar 1 a 1,5 mm más que el clavo.`,
    }
  }
  return { entra: true, holguraMm, aviso: null }
}

/** Lo que avanza el clavo con un golpe del martillo o del impactador, en mm. */
export function avancePorGolpeMm(holguraMm: number): number {
  if (holguraMm >= MARGEN_MINIMO_DEL_FRESADO_MM) return AVANCE_POR_GOLPE_SUELTO_MM
  if (holguraMm >= HOLGURA_QUE_NO_ENTRA_MM) return AVANCE_POR_GOLPE_JUSTO_MM
  return 0
}

/**
 * ¿Es el largo del clavo el que corresponde? Se juzga por lo que sobra entre su punta —con el clavo asentado a ras de la entrada— y el extremo distal del
 * canal: de 10 a 40 mm. Menos, la punta llega a la articulación; más, el fragmento distal queda sin la sujeción de los tornillos distales.
 */
export function juzgarElLargoDelClavo(largoMm: number, largoDelCanalMm: number): { bien: boolean; sobraMm: number; aviso: string | null } {
  const f = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
  const sobraMm = largoDelCanalMm - largoMm
  if (sobraMm < SOBRA_MINIMA_DEL_CLAVO_MM) {
    return { bien: false, sobraMm, aviso: `Un clavo de ${f(largoMm)} mm es largo para este canal (${f(largoDelCanalMm)} mm): la punta llegaría a la articulación. Elija uno más corto.` }
  }
  if (sobraMm > SOBRA_MAXIMA_DEL_CLAVO_MM) {
    return {
      bien: false,
      sobraMm,
      aviso: `Un clavo de ${f(largoMm)} mm es corto para este canal (${f(largoDelCanalMm)} mm): deja ${f(sobraMm)} mm sin cubrir y el fragmento distal quedaría sin sujeción. Elija uno más largo.`,
    }
  }
  return { bien: true, sobraMm, aviso: null }
}

export type AsientoDelClavo = 'saliente' | 'ideal' | 'hundido' | 'pasado'

/**
 * Dónde quedó el clavo. `avanceMm` es lo que entró su punta desde la entrada; el extremo proximal está `avanceMm - largoMm` bajo ella: negativo, el
 * clavo asoma (y roza el tendón rotuliano); de 0 a 10 mm, bien asentado; más, hundido. Si la punta pasa a menos de 10 mm del extremo distal del
 * canal, **se pasó**: tocaría la articulación.
 */
export function juzgarElAsiento(p: { avanceMm: number; largoMm: number; largoDelCanalMm: number }): { asiento: AsientoDelClavo; hundidoMm: number; aviso: string | null } {
  const f = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
  const hundidoMm = p.avanceMm - p.largoMm
  if (p.largoDelCanalMm - p.avanceMm < SOBRA_MINIMA_DEL_CLAVO_MM) {
    return { asiento: 'pasado', hundidoMm, aviso: 'La punta del clavo llegó a la articulación: es largo o se golpeó de más. Hay que retirarlo.' }
  }
  if (hundidoMm < 0) {
    return { asiento: 'saliente', hundidoMm, aviso: `El clavo asoma ${f(-hundidoMm)} mm por la entrada: siga golpeando hasta que quede a ras. Si queda saliente, roza el tendón rotuliano.` }
  }
  if (hundidoMm > HUNDIDO_MAXIMO_MM) {
    return { asiento: 'hundido', hundidoMm, aviso: `El clavo quedó ${f(hundidoMm)} mm hundido bajo la entrada: más de ${HUNDIDO_MAXIMO_MM} mm hace difícil retirarlo después.` }
  }
  return { asiento: 'ideal', hundidoMm, aviso: null }
}

/**
 * Qué pasa al golpear. El **impactador** se conecta al arco y protege el extremo del clavo: sin el arco montado no se puede golpear con él. El
 * **martillo** directo sobre el clavo deforma su extremo y la rosca donde luego se atornilla el arco: avanza, pero se avisa.
 */
export function golpear(instrumento: 'martillo' | 'impactador', arcoMontado: boolean): { golpea: boolean; aviso: string | null } {
  if (instrumento === 'impactador' && !arcoMontado) {
    return { golpea: false, aviso: 'El impactador va conectado al arco: monte primero el arco de inserción en el clavo.' }
  }
  if (instrumento === 'martillo') {
    return { golpea: true, aviso: 'El martillo golpea el extremo del clavo sin protección: se deforma la rosca donde va el arco. Lo correcto es golpear el impactador montado en el arco.' }
  }
  return { golpea: true, aviso: null }
}

// ------------------------------------------------------------------------------------------------ el estado del enclavado

/** Lo que el lienzo le cuenta a la consola de todo el enclavado hasta ahora. */
export interface EstadoDelEnclavado {
  entrada: (JuicioDeLaEntrada & { desdeElExtremoMm: number; desviacionMm: number }) | null
  guia: { avanceMm: number; largoDelCanalMm: number; atascada: boolean; cruzaElFoco: boolean; llegaAlFondo: boolean; aviso: string | null } | null
  dedoPuesto: boolean
  fresado: JuicioDelFresado & { cabezasMm: number[] }
  /** La guía de punta de oliva se cambió por la lisa con el tubo de intercambio: ya se puede pasar el clavo. */
  guiaCambiada: boolean
  /** El arco de inserción está montado en el clavo (P-005 E5): el impactador va conectado a él. */
  arcoMontado: boolean
  /** El clavo puesto en el canal, o `null` (P-005 E5). */
  clavo: {
    diametroMm: number
    largoMm: number
    avanceMm: number
    calibre: JuicioDelCalibreDelClavo
    largo: { bien: boolean; sobraMm: number; aviso: string | null }
    asiento: { asiento: AsientoDelClavo; hundidoMm: number; aviso: string | null }
    golpes: number
    /** El último aviso de un golpe (martillo sin protección, atascado). */
    avisoDelGolpe: string | null
    /** Los orificios del clavo y cómo apuntó el tornillo de cada uno, o `null` si todavía no lleva (P-005 E6). */
    orificios: { id: string; zona: OrificioDelClavo['zona']; dinamico: boolean; punteria: Punteria | null }[]
    bloqueo: { suficiente: boolean; aviso: string | null }
  } | null
}

export const ENCLAVADO_VACIO: EstadoDelEnclavado = {
  entrada: null,
  guia: null,
  dedoPuesto: false,
  fresado: { listo: false, mayorMm: 0, aviso: null, cabezasMm: [] },
  guiaCambiada: false,
  arcoMontado: false,
  clavo: null,
}

/** Lo que falta para poder pasar el clavo, en el orden en que se hace; vacío si ya se puede. */
export function loQueFaltaParaElClavo(e: EstadoDelEnclavado): string[] {
  const falta: string[] = []
  if (!e.entrada?.buena) falta.push('el punto de entrada')
  if (!e.guia?.cruzaElFoco || !e.guia.llegaAlFondo) falta.push('la guía pasada hasta el extremo distal')
  if (!e.fresado.listo) falta.push('el fresado')
  if (!e.guiaCambiada) falta.push('el cambio de la guía con el tubo de intercambio')
  return falta
}

/** Qué decir de cada paso, para la lista del recuadro: una línea por paso con su estado. */
export function listaDelEnclavado(e: EstadoDelEnclavado): { paso: string; hecho: boolean; texto: string }[] {
  const f = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
  return [
    {
      paso: 'Entrada',
      hecho: !!e.entrada?.buena,
      texto: e.entrada ? `${f(e.entrada.desdeElExtremoMm)} mm del extremo, ${f(e.entrada.desviacionMm)} mm fuera de línea${e.entrada.buena ? '' : ' (no sirve)'}` : 'sin marcar',
    },
    {
      paso: 'Guía',
      hecho: !!e.guia && e.guia.cruzaElFoco && e.guia.llegaAlFondo,
      texto: e.guia
        ? e.guia.atascada
          ? `atascada en el foco (${f(e.guia.avanceMm)} mm)`
          : e.guia.llegaAlFondo
            ? `hasta el extremo distal (${f(e.guia.avanceMm)} mm)`
            : e.guia.cruzaElFoco
              ? `pasó el foco, ${f(e.guia.avanceMm)} mm`
              : `${f(e.guia.avanceMm)} mm, sin llegar al foco`
        : 'sin pasar',
    },
    { paso: 'Fresado', hecho: e.fresado.listo, texto: e.fresado.cabezasMm.length ? `hasta ${f(e.fresado.mayorMm)} mm (${e.fresado.cabezasMm.map(f).join(' → ')})` : 'sin fresar' },
    { paso: 'Cambio de guía', hecho: e.guiaCambiada, texto: e.guiaCambiada ? 'guía lisa puesta' : 'pendiente' },
    {
      paso: 'Clavo',
      hecho: !!e.clavo && e.clavo.asiento.asiento === 'ideal',
      texto: e.clavo
        ? `${f(e.clavo.diametroMm)} × ${f(e.clavo.largoMm)} mm · ${
            e.clavo.asiento.asiento === 'ideal'
              ? 'bien asentado'
              : e.clavo.asiento.asiento === 'saliente'
                ? `asoma ${f(-e.clavo.asiento.hundidoMm)} mm`
                : e.clavo.asiento.asiento === 'hundido'
                  ? `hundido ${f(e.clavo.asiento.hundidoMm)} mm`
                  : 'pasó la articulación'
          }`
        : e.arcoMontado
          ? 'arco montado, sin clavo'
          : 'sin poner',
    },
    {
      paso: 'Bloqueo',
      hecho: !!e.clavo && e.clavo.bloqueo.suficiente,
      texto: e.clavo
        ? e.clavo.orificios.length === 0
          ? 'este clavo no trae orificios'
          : e.clavo.orificios.some((o) => o.punteria)
            ? e.clavo.orificios
                .filter((o) => o.punteria)
                .map((o) => `${o.id}${o.punteria === 'acierta' ? '' : o.punteria === 'roza' ? ' (roza)' : ' (falló)'}`)
                .join(' · ')
            : 'sin tornillos'
        : 'sin clavo',
    },
  ]
}
