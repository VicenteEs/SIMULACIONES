import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESQUEMAS } from '@/admin/esquema'

/**
 * El listado de una colección, y sobre todo su subidor de archivos.
 *
 * El entorno de la suite es `node` y el proyecto no tiene jsdom ni biblioteca
 * de componentes (ver `vitest.config.ts`), así que aquí no se pinta nada y el
 * componente ni siquiera se importa: arrastra la acción de servidor de subida.
 * Se hace lo mismo que ya hacen `formularios.test.ts` y `campos.test.ts` con
 * los otros dos formularios del panel —leer la fuente y exigir que las
 * decisiones sigan escritas—, más la única parte que sí es dato y se puede
 * ejercitar de verdad: que el número del techo y la frase que lo anuncia sigan
 * diciendo lo mismo.
 *
 * Lo que se vigila es lo que ya se rompió:
 *
 *  1. Un botón que solo servía para el ratón en las dos colecciones que no
 *     tienen ninguna otra forma de crear una ficha.
 *  2. Una subida que fallaba en silencio, y una tanda que se abandonaba entera
 *     por culpa del primer archivo pasado de peso.
 *  3. Acciones de servidor cuyo rechazo no lo recogía nadie.
 */

const RAIZ = process.cwd()
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')

const TABLA = fuente('src', 'components', 'admin', 'TablaDocumentos.tsx')

/** El cuerpo del subidor, que es donde vive casi todo lo de aquí abajo. */
const SUBIDOR = TABLA.slice(TABLA.indexOf('function SubidorDeArchivos'))

describe('el subidor de archivos se puede usar sin ratón', () => {
  it('el control es un botón de verdad y no un `<label>` con el input dentro', () => {
    // `hidden` es `display:none`: el input queda fuera del orden de tabulación
    // y del árbol de accesibilidad, y un `<label>` no recibe foco porque no es
    // tabulable. En medios y en modelos 3D este subidor sustituye al enlace
    // «+ Agregar», así que con teclado esas dos colecciones no tenían ninguna
    // vía de creación.
    expect(SUBIDOR).toMatch(/<button\s+type="button"/)
    expect(SUBIDOR).toContain('entrada.current?.click()')
    expect(SUBIDOR).toMatch(/ref=\{entrada\}/)
    expect(SUBIDOR).not.toMatch(/<label className="admin-btn/)
  })

  it('el botón no se desactiva mientras sube: avisa con el rótulo', () => {
    // Es el botón que se acaba de pulsar, o sea el que tiene el foco cuando la
    // subida arranca. Desactivarlo con el foco dentro lo suelta en el `<body>`
    // y el siguiente tabulador arranca desde el principio de la página.
    expect(SUBIDOR).toContain('aria-disabled={enCurso}')
    expect(SUBIDOR).toContain("{enCurso ? 'Subiendo…' : '+ Subir archivo'}")
  })
})

describe('el peso se pregunta antes de que el archivo viaje', () => {
  it('el techo se lee de la colección y no hay ningún número escrito aquí', () => {
    // Por encima del cuerpo de 8 MB, Next descarta la petición sin invocar la
    // acción: no vuelve ninguna `Respuesta` con `mensaje` y la pantalla se
    // quedaba muda. Y el 7 que había escrito aquí valía para las dos
    // colecciones, cuando en modelos 3D el techo son 5.
    expect(TABLA).toContain('esquema.subida?.maximoBytes')
    expect(TABLA).not.toMatch(/\d+ \* 1024 \* 1024/)
  })

  for (const esquema of ESQUEMAS.filter((e) => e.subida)) {
    it(`«${esquema.plural}» anuncia en su ayuda el mismo techo que declara`, () => {
      // El mensaje del subidor compone «el máximo son N MB» con `maximoBytes`,
      // y justo debajo se pinta `subida.ayuda`, que lo dice en prosa. Si se
      // separan, la misma caja de la pantalla se contradice a sí misma.
      const megas = Math.round(esquema.subida!.maximoBytes / (1024 * 1024))
      expect(esquema.subida!.ayuda).toContain(`${megas} MB`)
    })
  }

  it('un archivo pasado de peso no abandona a los que van detrás', () => {
    // El bucle cortaba con `break` en el primer fallo: arrastrar diez
    // radiografías y que la tercera pesara de más dejaba siete sin subir, con
    // un mensaje que solo nombraba a la tercera.
    const bucle = SUBIDOR.slice(
      SUBIDOR.indexOf('for (const archivo of admitidos)'),
      SUBIDOR.indexOf('alTerminar()'),
    )
    expect(bucle).not.toMatch(/\bbreak\b/)
    expect(bucle).toContain('problemas.push(')
  })

  it('lo que rechaza el marco se pinta en vez de perderse en la consola', () => {
    // Cuerpo demasiado grande, sesión caída o red cortada no vuelven como
    // respuesta sino como excepción: sin esto el botón salía de «Subiendo…»,
    // el listado se recargaba igual y nada decía que faltaba un archivo.
    const bucle = SUBIDOR.slice(
      SUBIDOR.indexOf('for (const archivo of admitidos)'),
      SUBIDOR.indexOf('alTerminar()'),
    )
    expect(bucle).toMatch(/try \{[\s\S]*await subirArchivo\(formulario\)[\s\S]*\} catch/)
  })
})

describe('ninguna acción del listado se cae en silencio', () => {
  it('la carga apaga el indicador aunque la acción no devuelva nada', () => {
    // Sin el `finally`, con la sesión caída el `setCargando(false)` no llegaba
    // a ejecutarse y la pantalla se quedaba en «cargando…» sobre una tabla
    // vacía para siempre.
    const cargar = TABLA.slice(TABLA.indexOf('const cargar = useCallback'), TABLA.indexOf('// La búsqueda espera'))
    expect(cargar).toMatch(/\} catch \(fallo\) \{[\s\S]*\} finally \{[\s\S]*setCargando\(false\)/)
  })

  it('publicar, duplicar y eliminar recogen el rechazo de la acción', () => {
    const desde = TABLA.indexOf('const conAviso = (')
    const conAviso = TABLA.slice(desde, TABLA.indexOf('return (', desde))
    expect(conAviso).toMatch(/try \{[\s\S]*await tarea\(\)[\s\S]*\} catch \(fallo\) \{/)
    expect(conAviso).toContain('motivoDeLaCaida(fallo')
  })
})

describe('el resultado de la acción se anuncia', () => {
  it('la región del aviso amable se queda montada aunque esté vacía', () => {
    // Un `role="status"` que aparece a la vez que su texto no se anuncia: el
    // lector de pantalla tiene que estar observando la región antes de que su
    // contenido cambie. Es el mismo arreglo que en `FormularioDocumento.tsx`.
    const region = TABLA.indexOf('<div role="status">')
    expect(region).toBeGreaterThan(-1)
    expect(TABLA.slice(region, region + 120)).toContain("{aviso?.tipo === 'ok' ? (")
  })

  it('el error interrumpe, porque `role="alert"` sí se lee al insertarse', () => {
    const desde = TABLA.indexOf("{aviso?.tipo === 'error' ? (")
    expect(desde).toBeGreaterThan(-1)
    expect(TABLA.slice(desde, TABLA.indexOf('{aviso.texto}', desde))).toContain('role="alert"')
  })
})

describe('borrar una fila no deja el foco en el `<body>`', () => {
  it('se anota la posición y se recoge el foco cuando vuelve el listado', () => {
    // El botón «Eliminar» se desmonta con su fila y el foco cae al `<body>`: el
    // siguiente tabulador arranca desde el principio de la página, una vez por
    // cada ficha que se borre.
    expect(TABLA).toContain('focoTrasBorrar')
    expect(TABLA).toContain("querySelectorAll<HTMLAnchorElement>('[data-editar]')")
    expect(TABLA).toContain('data-editar=""')
  })

  it('solo «Eliminar» pide ese foco: a las demás no se les mueve de sitio', () => {
    const desde = TABLA.indexOf('() => eliminarDocumento(')
    expect(desde).toBeGreaterThan(-1)
    expect(TABLA.slice(desde, desde + 200)).toContain('posicion,')
    // Una sola vez. Lo que libra a publicar y duplicar de tener que pedirlo no
    // es que su fila siga en su sitio —también, pero no basta—: es que su botón
    // no llega a perder el foco, porque lleva `aria-disabled`. Ver la prueba de
    // aquí abajo; si alguno volviera a `disabled`, esta cuenta tendría que
    // subir a tres.
    expect(TABLA.match(/^\s*posicion,$/gm) ?? []).toHaveLength(1)
  })

  it('ninguna acción de fila se desactiva de verdad mientras la tabla trabaja', () => {
    // El botón que se pulsa ES el que tiene el foco: al arrancar la transición,
    // `disabled={enCurso}` hacía que el navegador lo desenfocara y soltara el
    // foco en el `<body>` antes incluso de que la fila se repintara, así que
    // publicar veinte fichas seguidas devolvía veinte veces al principio de la
    // página. «Eliminar» se salvaba de rebote, por el efecto de
    // `focoTrasBorrar`. Quien corta la doble pulsación es la guarda del
    // `onClick`, y no se pierde nada visual porque `.admin-btn` no define
    // estilo de `:disabled`.
    const cuerpo = TABLA.slice(TABLA.indexOf('<tbody ref={cuerpo}>'), TABLA.indexOf('</tbody>'))
    // El guion del `aria-` se descarta a mano: `toContain('disabled={enCurso}')`
    // encuentra también el atributo bueno y la prueba pasaría siempre.
    expect(cuerpo).not.toMatch(/(?<![-\w])disabled=\{enCurso\}/)
    // Las tres: publicar/retirar, duplicar y eliminar.
    expect(cuerpo.match(/aria-disabled=\{enCurso\}/g) ?? []).toHaveLength(3)
    // Anclado a línea entera: suelto encontraba también la mención del
    // comentario de ahí arriba y contaba cuatro.
    expect(cuerpo.match(/^\s*if \(enCurso\) return$/gm) ?? []).toHaveLength(3)
  })
})
