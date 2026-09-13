import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Que las cinco páginas pregunten por lo leído a `src/lib/lecturas.ts`, y que
 * terminar un caso lo dé por leído de verdad.
 *
 * `tests/unit/lecturas.test.ts` prueba la función; esto prueba que alguien la
 * llama. Es el fallo que más ha costado en este repositorio —una función
 * escrita y probada a la que nadie llama—, y aquí tendría una forma muy
 * concreta: una página que conserva su copia de la consulta y sigue
 * funcionando, con su propio criterio para las filas gemelas, sin que ninguna
 * pantalla lo delate.
 *
 * Son componentes de servidor y de cliente que no se pueden montar en esta
 * suite —no hay jsdom ni base—, así que se leen en el disco y sin comentarios:
 * los de estos archivos nombran a propósito lo que cablean y sin quitarlos las
 * comprobaciones casarían contra su propia explicación.
 */

const RAIZ = process.cwd()

const codigoDe = (...partes: string[]): string =>
  readFileSync(join(RAIZ, ...partes), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\}/g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const pagina = (...carpetas: string[]): string =>
  codigoDe('src', 'app', '(frontend)', ...carpetas, 'page.tsx')

const veces = (codigo: string, trozo: string): number => codigo.split(trozo).length - 1

const FICHAS = [
  { carpeta: 'biblioteca', slug: 'patologias' },
  { carpeta: 'tecnica-ao', slug: 'casos-ao' },
  { carpeta: 'simulador', slug: 'cirugias' },
  { carpeta: 'imagenes', slug: 'estudios-ia' },
]

const LISTADO = pagina('examen-fisico')
const CONSOLA = codigoDe('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')
const ENVOLTORIO = codigoDe('src', 'components', 'simulador', 'CasoConSuLectura.tsx')
const PAGINA_DEL_CASO = pagina('simulador', '[id]')

describe('las cinco páginas preguntan en el mismo sitio', () => {
  it.each(FICHAS)('$carpeta llama a lecturasDelResidente sobre «$slug»', ({ carpeta, slug }) => {
    const codigo = pagina(carpeta, '[id]')
    expect(codigo).toContain("import { lecturasDelResidente } from '@/lib/lecturas'")
    expect(codigo).toContain(
      `lecturasDelResidente(payload, usuarioEfectivo, '${slug}', [id])`,
    )
  })

  it.each(FICHAS)('$carpeta ya no guarda su copia de la consulta', ({ carpeta }) => {
    expect(pagina(carpeta, '[id]')).not.toContain("collection: 'actividad'")
  })

  it('el examen físico llama a la misma función con la lista entera', () => {
    expect(LISTADO).toContain("import { lecturasDelResidente } from '@/lib/lecturas'")
    expect(LISTADO).toContain(
      "lecturasDelResidente(payload, usuarioEfectivo, 'maniobras', identificadores)",
    )
    expect(LISTADO).not.toContain("collection: 'actividad'")
  })

  it('el examen físico pregunta una vez, antes de pintar, y no una por tarjeta', () => {
    // Dentro del `.map` funcionaría igual, con treinta consultas para treinta
    // casillas: es la regresión que la función por listas existe para evitar.
    expect(veces(LISTADO, 'lecturasDelResidente(')).toBe(1)
    const llamada = LISTADO.indexOf('lecturasDelResidente(payload')
    const primeraTarjeta = LISTADO.indexOf('grupos.map(')
    expect(primeraTarjeta).toBeGreaterThan(-1)
    expect(llamada).toBeLessThan(primeraTarjeta)
    expect(LISTADO).toContain('completadoInicial={lecturas.leida(m.id)}')
  })

  it('las casillas se deciden con `leida`, el mismo criterio en las cinco', () => {
    for (const { carpeta } of FICHAS) {
      expect(pagina(carpeta, '[id]'), carpeta).toContain('lecturas.leida(id)')
    }
  })

  it('el simulador saca el recorrido guardado de la misma fila, sin otra consulta', () => {
    expect(PAGINA_DEL_CASO).toContain('const registroDeLectura = lecturas.registro(id)')
    expect(PAGINA_DEL_CASO).toContain('recorridoGuardado={recorridoGuardado(registroDeLectura)}')
    expect(veces(PAGINA_DEL_CASO, 'lecturasDelResidente(')).toBe(1)
  })
})

describe('terminar el caso lo da por leído', () => {
  const aplicar = CONSOLA.slice(
    CONSOLA.indexOf('function aplicarPaso()'),
    CONSOLA.indexOf('function reiniciar()'),
  )

  it('con la misma acción que la casilla, y no con una escritura propia', () => {
    expect(CONSOLA).toMatch(
      /import \{[^}]*\bmarcarComoLeida\b[^}]*\} from '@\/app\/\(frontend\)\/acciones\/actividad'/,
    )
    expect(veces(CONSOLA, 'marcarComoLeida(')).toBe(1)
    expect(CONSOLA).toContain("marcarComoLeida('cirugias', documentoId, true)")
  })

  it('al superar el último paso, con la misma cuenta que pinta «Caso terminado»', () => {
    expect(aplicar, 'no se encontró aplicarPaso').not.toBe('')
    expect(aplicar).toContain('if (siguiente >= caso.pasos.length) marcarCasoComoLeido()')
    expect(CONSOLA).toContain('const terminado = indice >= caso.pasos.length')
    // Solo desde el paso superado: marcar desde la rama del fallo daría por
    // leído un caso que se quedó a medias.
    const hastaElAcierto = aplicar.slice(0, aplicar.indexOf('const puntos = puntosDelPaso('))
    expect(hastaElAcierto).toContain('if (!evaluacion.avanza)')
    expect(hastaElAcierto).not.toContain('marcarCasoComoLeido')
  })

  it('no toca la cola del recorrido: siguen siendo dos guardados y una marca', () => {
    expect(veces(CONSOLA, 'guardarRecorrido(')).toBe(2)
    expect(veces(CONSOLA, 'registrarResultadoDeCirugia(')).toBe(1)
  })

  it('el fallo se dice, y el éxito solo cuando volvió', () => {
    const marcar = CONSOLA.slice(
      CONSOLA.indexOf('const marcarCasoComoLeido = useCallback('),
      CONSOLA.indexOf('const refrescarVisibles = useCallback('),
    )
    expect(marcar).toContain("setLecturaAlTerminar('fallida')")
    expect(marcar).toContain('anotar(')
    expect(marcar.indexOf('await marcarComoLeida(')).toBeLessThan(
      marcar.indexOf("setLecturaAlTerminar('marcada')"),
    )
    expect(CONSOLA).toContain("lecturaAlTerminar === 'marcada'")
    expect(CONSOLA).toContain("lecturaAlTerminar === 'fallida'")
  })
})

describe('la casilla de arriba se entera sin recargar', () => {
  it('la consola exige a alguien que escuche, y avisa después de escribir', () => {
    // Obligatoria: una consola montada sin nadie que mueva la casilla tiene que
    // fallar al compilar.
    expect(CONSOLA).toContain('alMarcarComoLeido: () => void')
    const marcar = CONSOLA.slice(CONSOLA.indexOf('const marcarCasoComoLeido = useCallback('))
    expect(marcar.indexOf('await marcarComoLeida(')).toBeLessThan(
      marcar.indexOf('alMarcarComoLeido()'),
    )
  })

  it('la página monta la consola a través del envoltorio, no suelta', () => {
    expect(PAGINA_DEL_CASO).toContain('<CasoConSuLectura')
    expect(PAGINA_DEL_CASO).not.toContain('<ConsolaQuirurgica')
    expect(PAGINA_DEL_CASO).not.toContain('<RastreadorActividad')
    // Dentro de la etiqueta y no en el archivo: `documentoId={id}` lo lleva
    // también `<FormularioComentario>`, y en el archivo entero casaba aunque el
    // envoltorio no recibiera la ficha.
    const inicio = PAGINA_DEL_CASO.indexOf('<CasoConSuLectura')
    const propiedades = PAGINA_DEL_CASO.slice(inicio, PAGINA_DEL_CASO.indexOf('/>', inicio))
    expect(propiedades).toContain('completadoInicial={lecturas.leida(id)}')
    expect(propiedades).toContain('documentoId={id}')
  })

  it('el envoltorio conecta el aviso con la casilla y la vuelve a montar marcada', () => {
    expect(ENVOLTORIO).toContain('alMarcarComoLeido={alMarcarComoLeido}')
    expect(ENVOLTORIO).toContain('key={marcasDeLaConsola}')
    expect(ENVOLTORIO).toContain('completadoInicial={marcasDeLaConsola > 0 || completadoInicial}')
    expect(ENVOLTORIO).toContain('setMarcasDeLaConsola((n) => n + 1)')
  })

  it('la casilla del envoltorio es la de esta cirugía', () => {
    const inicio = ENVOLTORIO.indexOf('<RastreadorActividad')
    const propiedades = ENVOLTORIO.slice(inicio, ENVOLTORIO.indexOf('/>', inicio))
    expect(propiedades).toContain('coleccion="cirugias"')
    expect(propiedades).toContain('documentoId={documentoId}')
    // Anota su visita, como las otras tres fichas por documento.
    expect(propiedades).not.toContain('anotarVisita')
  })
})
