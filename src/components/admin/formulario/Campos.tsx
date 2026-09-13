'use client'

import { useEffect, useId, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ESQUEMAS, type Campo } from '@/admin/esquema'
import { BLOQUES, bloqueDe } from '@/admin/bloques'
import { formularioDeArchivo, subidorQueAvisa } from '@/admin/subidas'
import { EditorDeEncuadre } from './EditorDeEncuadre'
import { TallerDePiezas, type DesplazamientoInicial } from './TallerDePiezas'
import type { Encuadre } from '@/components/Visor3D'

/**
 * Los controles del formulario, uno por tipo de campo del esquema.
 *
 * Todo es controlado y sin estado propio salvo lo que es puramente visual
 * (un bloque plegado, una subida en curso). El documento entero vive en el
 * componente de la página, de modo que guardar es enviar ese objeto y no
 * recolectar el valor de treinta controles repartidos.
 */

/**
 * TipTap y ProseMirror son 134 KB comprimidos, y la mitad de las colecciones no
 * tiene un solo campo `rico`: corregir el orden de un segmento o el texto
 * alternativo de una imagen descargaba y compilaba un editor que no se iba a
 * pintar. Viajaba sin diferir porque este archivo es de cliente y
 * `FormularioDocumento` lo consume, así que entraba en el trozo de entrada de
 * las dos rutas de edición. Es el mismo trato que ya reciben `EditorDeEncuadre`
 * y `TallerDePiezas`, que difieren three.js por la misma razón.
 *
 * El `dynamic()` tiene que quedarse aquí, en un componente de cliente: en uno
 * de servidor `ssr: false` no está permitido y el trozo no se separa.
 */
const EditorTextoRico = dynamic(
  () => import('./EditorTextoRico').then((m) => m.EditorTextoRico),
  { ssr: false, loading: () => <p className="campo-ayuda">Cargando editor…</p> },
)

export interface OpcionRelacion {
  id: string
  etiqueta: string
  url?: string
  tipo?: string
}

export type Relaciones = Record<string, OpcionRelacion[]>

interface Props {
  campo: Campo
  valor: unknown
  alCambiar: (nuevo: unknown) => void
  relaciones: Relaciones
  alRecargarRelacion?: (coleccion: string) => void
  /**
   * Los valores de los campos que están al mismo nivel que este.
   *
   * Casi ningún control los necesita: un campo se pinta con su propio valor y
   * ya está. La excepción es el editor de encuadre, que tiene que saber qué
   * modelo eligió el traumatólogo en el campo de al lado para poder enseñarlo.
   */
  hermanos?: Record<string, unknown>
  /**
   * Escribe otro campo del mismo nivel.
   *
   * Lo necesita el taller de piezas: señalar los trozos escribe `piezas` y
   * capturar el desplazamiento escribe `desplazamientoInicial`, que es un campo
   * hermano. Sin esto habría que partir el taller en dos mitades que no se ven
   * entre sí, y el botón de capturar quedaría lejos del modelo.
   */
  alCambiarHermano?: (nombre: string, valor: unknown) => void
}

const texto = (valor: unknown): string =>
  valor === null || valor === undefined ? '' : String(valor)

/** Busca una opción de relación por su identificador, venga como sea. */
function opcionDeRelacion(
  relaciones: Relaciones,
  coleccion: string,
  bruto: unknown,
): OpcionRelacion | undefined {
  if (bruto === null || bruto === undefined) return undefined
  const id =
    typeof bruto === 'object' ? String((bruto as { id?: unknown }).id ?? '') : String(bruto)
  if (!id) return undefined
  return (relaciones[coleccion] ?? []).find((o) => o.id === id)
}

/**
 * Qué archivo tiene que enseñar el editor de encuadre, que no es el mismo en
 * los dos formularios donde aparece.
 *
 * En una ficha, el grupo `encuadre` vive dentro del bloque «Modelo 3D» y el
 * archivo es el que se eligió en el campo hermano `modelo`: una relación, que
 * hay que resolver contra las opciones ya cargadas.
 *
 * En la ficha de un modelo 3D **no hay ningún hermano `modelo`**, porque el
 * modelo es el documento que se está editando. Su `url` y su `nombre` están
 * entre los hermanos desde que la pantalla abre, por ser una colección de
 * subida, y aun así el editor salía por su rama temprana —«Elija primero un
 * modelo arriba»— debajo de una ayuda que manda a pulsar «Capturar encuadre».
 * Es la forma exacta de la regresión de D-038: el campo declarado, la ayuda
 * escrita y ningún botón en pantalla que pulsar.
 *
 * El orden importa y es este: primero el hermano, después el documento. Al
 * revés, un formulario de subida que algún día llevara un bloque con modelo
 * enseñaría su propio archivo en vez del elegido. Y la segunda rama no puede
 * dispararse por error en un bloque ni en una fila de lista: `url` solo existe
 * en el documento de una colección de subida, y esas nunca se crean desde el
 * formulario en blanco (`admin-panel/contenido/[coleccion]/nuevo/page.tsx`
 * redirige al listado), así que cuando existe, trae archivo.
 */
function modeloParaEncuadrar(
  relaciones: Relaciones,
  hermanos: Record<string, unknown> | undefined,
): { url: string | null; nombre?: string } {
  const elegido = opcionDeRelacion(relaciones, 'modelos-3d', hermanos?.modelo)
  if (elegido) return { url: elegido.url ?? null, nombre: elegido.etiqueta }

  const propia = hermanos?.url
  if (typeof propia === 'string' && propia) {
    // Sin `ruta()`: la dirección de un archivo subido ya viene con el prefijo
    // puesto por Payload, y ponérselo otra vez reproduce el apagón O-019
    // (`src/lib/rutas.ts`, `tests/unit/archivosSubidos.test.ts`). Es la misma
    // `url` que sirve `opcionesDeRelacion` para la otra rama.
    const nombre = hermanos?.nombre ?? hermanos?.filename
    return { url: propia, nombre: typeof nombre === 'string' ? nombre : undefined }
  }

  return { url: null }
}

// ------------------------------------------------- identidad de filas y bloques

/**
 * Clave de reconciliación propia del cliente.
 *
 * El `id` de una fila o de un bloque lo pone Payload al guardar, así que todo
 * lo que nace en la sesión no tiene ninguno y React reconciliaba por posición.
 * Para los `<input>` y los `<select>` eso no se notaba —son controlados y su
 * valor viene del arreglo—, pero `EditorTextoRico` siembra TipTap una sola vez
 * al construirse: al subir un paso con la flecha, el título y la fase se
 * intercambiaban y los dos textos ricos se quedaban quietos, de modo que el
 * paso ahora titulado «Reducción» enseñaba la descripción del abordaje. Y en
 * cuanto se tocaba ese editor, `onUpdate` escribía el texto viejo encima de la
 * fila que había pasado a ocupar el sitio.
 *
 * **No puede llamarse `id`**: `depurarCampo` conserva esa clave tal cual para
 * filas y bloques (`src/admin/depurar.ts`) y acabaría en la clave primaria de
 * PostgreSQL. Con cualquier otro nombre no viaja: `depurarCampos` reconstruye
 * la salida recorriendo los campos del esquema, y lo que no está descrito no
 * existe.
 */
const CLAVE_DE_FILA = '_clave'

let contadorDeClaves = 0
/**
 * Solo tiene que distinguir hermanos dentro de una página viva, así que un
 * contador basta y evita depender de `crypto.randomUUID()`, que exige contexto
 * seguro y no lo hay al abrir el panel por http en una máquina de la red.
 */
const nuevaClave = (): string => `c${++contadorDeClaves}`

/** Con qué se identifica una fila o un bloque en el `key` de React. */
function claveDe(fila: Record<string, unknown>, indice: number): string {
  const id = fila.id
  if (typeof id === 'string' || typeof id === 'number') return `id-${id}`
  const propia = fila[CLAVE_DE_FILA]
  if (typeof propia === 'string') return propia
  // Último recurso, y con el mismo problema de siempre: una fila que llega del
  // servidor sin `id` y sin haber pasado por «+ Agregar» vuelve a reconciliarse
  // por posición. Payload numera todas las suyas, así que en la práctica no
  // ocurre; si alguna vez ocurre, el síntoma es el del comentario de arriba.
  return `pos-${indice}`
}

/**
 * Los valores con los que abre algo recién creado.
 *
 * Una fila nacía como `{}` y un bloque como `{ blockType }`. Con un desplegable
 * obligatorio eso miente: el control no ofrece opción vacía, el navegador
 * enseña la primera de la lista y `depurarCampo` guarda `porOmision`. En
 * `piezas[].rol` la tabla decía «Piel» —primera porque es la capa más externa—
 * y la base guardaba «hueso», que es lo que declaran la colección y la consola.
 *
 * La regla es la misma que la de `documentoEnBlanco`
 * (`admin-panel/contenido/[coleccion]/nuevo/page.tsx`) y la misma que la del
 * respaldo de `depurarCampo`: el orden de la lista es de presentación y no
 * decide nada. Los tres sitios se mueven juntos; separarlos no da ningún error,
 * solo deja otra vez una pantalla que enseña una cosa y guarda otra.
 */
function valoresPorOmision(campos: Campo[]): Record<string, unknown> {
  const valores: Record<string, unknown> = {}
  for (const campo of campos) {
    if (campo.tipo === 'seleccion') {
      valores[campo.nombre] = campo.porOmision ?? campo.opciones[0]?.valor ?? ''
    } else if (campo.tipo === 'grupo') {
      valores[campo.nombre] = valoresPorOmision(campo.campos)
    }
  }
  return valores
}

/**
 * Qué enseña un desplegable que todavía no tiene valor.
 *
 * Un `<select>` obligatorio no ofrece opción vacía, así que con `value=''` el
 * navegador enseña la primera de la lista —y esa lista se ordena para leerla,
 * no para decidir—. En `piezas[].rol` la primera es «Piel», la capa más
 * externa, mientras `depurarCampo` guarda `porOmision`, que es «hueso»: el
 * taller rotulaba «Hueso (fijo)», la fila de abajo decía «Piel» y la base
 * guardaba «hueso», los tres a la vez y sin que nada fallara. El respaldo de
 * aquí arriba cerró las filas que nacen en «+ Agregar»; esto cierra las que
 * llegan del servidor con el campo en blanco, que son las de antes de que ese
 * respaldo existiera.
 *
 * Se calca el respaldo de `depurarCampo` (`src/admin/depurar.ts`, rama
 * `seleccion`): los dos se mueven juntos o la pantalla vuelve a enseñar una
 * cosa y la base a guardar otra. Y no se escribe en el documento desde aquí:
 * quien abre una ficha para corregir una coma no puede encontrársela sucia por
 * haberla abierto.
 */
const seleccionVisible = (campo: Extract<Campo, { tipo: 'seleccion' }>, valor: unknown): string =>
  texto(valor) || (campo.requerido ? (campo.porOmision ?? campo.opciones[0]?.valor ?? '') : '')

// ---------------------------------------------------------------------------

export function ControlDeCampo({
  campo,
  valor,
  alCambiar,
  relaciones,
  alRecargarRelacion,
  hermanos,
  alCambiarHermano,
}: Props) {
  const id = useId()
  const idEtiqueta = `${id}-etiqueta`
  const idAyuda = `${id}-ayuda`

  const nombreDelCampo = (
    <>
      {campo.etiqueta}
      {campo.requerido ? <span className="campo-obligatorio" title="Obligatorio"> *</span> : null}
    </>
  )

  const etiqueta = (
    <label className="campo-etiqueta" htmlFor={id}>
      {nombreDelCampo}
    </label>
  )

  /**
   * El mismo rótulo para lo que `<label for>` no sabe nombrar.
   *
   * `for` solo apunta a un elemento etiquetable: sobre un grupo de casillas o
   * sobre el `div contenteditable` de TipTap no nombra nada y además no enfoca
   * al hacer clic. Ahí el nombre lo da `aria-labelledby` contra este `id`, que
   * antes no existía en ninguna parte del DOM. Quien lo cita tiene que ser el
   * elemento que recibe el foco, y no solo su envoltorio: en el texto rico eso
   * lo hace `EditorTextoRico`, que recibe este `id` por props.
   */
  const rotulo = (
    <span className="campo-etiqueta" id={idEtiqueta}>
      {nombreDelCampo}
    </span>
  )

  /**
   * La ayuda no es decorativa en este esquema: es donde vive la regla que
   * cambia el significado del campo («si se deja vacía, la componen los pasos»,
   * «se comprueba el contenido, no la extensión»). Sin `aria-describedby`, quien
   * recorre el formulario control a control con lector de pantalla no la oye
   * nunca y rellena según lo que cree que significa la etiqueta.
   */
  const ayuda = campo.ayuda ? (
    <p className="campo-ayuda" id={idAyuda}>
      {campo.ayuda}
    </p>
  ) : null
  const describe = campo.ayuda ? idAyuda : undefined

  switch (campo.tipo) {
    case 'texto':
      return (
        <div className={`campo${campo.medio ? ' campo-medio' : ''}`}>
          {etiqueta}
          <input
            id={id}
            className="campo-control"
            aria-describedby={describe}
            value={texto(valor)}
            onChange={(e) => alCambiar(e.target.value)}
          />
          {ayuda}
        </div>
      )

    case 'area':
      return (
        <div className="campo">
          {etiqueta}
          <textarea
            id={id}
            className="campo-control"
            aria-describedby={describe}
            rows={campo.filas ?? 3}
            value={texto(valor)}
            onChange={(e) => alCambiar(e.target.value)}
          />
          {ayuda}
        </div>
      )

    case 'numero': {
      // La escala del caso se cierra aquí, en su propia casilla, además de en
      // el taller donde se gasta. El guardián y el aviso de `EditorDeLista`
      // estaban río abajo: la casilla seguía sin mínimo, así que la flecha
      // hacia abajo del teclado —o el botón de bajar del control— pasaba de 1 a 0
      // y de 0 a -1, que es justo el número que espeja los seis valores del
      // desplazamiento, y la casilla no se daba por enterada. El porqué de cada
      // pieza, junto a `SUELO_DE_LAS_FLECHAS`.
      const esLaEscala = campo.nombre === CAMPO_DE_ESCALA
      const escalaMal = esLaEscala && escalaSustituida(valor)
      const idAviso = `${id}-aviso`
      return (
        <div className={`campo${campo.medio ? ' campo-medio' : ''}`}>
          {etiqueta}
          <input
            id={id}
            type="number"
            className="campo-control"
            aria-describedby={[describe, escalaMal ? idAviso : null].filter(Boolean).join(' ') || undefined}
            aria-invalid={esLaEscala ? escalaMal : undefined}
            min={campo.min ?? (esLaEscala ? SUELO_DE_LAS_FLECHAS : undefined)}
            max={campo.max}
            step={campo.paso ?? 'any'}
            value={valor === null || valor === undefined ? '' : String(valor)}
            onChange={(e) => alCambiar(e.target.value === '' ? null : Number(e.target.value))}
          />
          {escalaMal ? (
            // No es una alerta: la del taller ya se anuncia al aparecer, y dos
            // alertas con el mismo motivo se pisan en el lector. Este se oye al
            // volver a la casilla, que es cuando hace falta, por el
            // `aria-describedby` de arriba.
            <p className="campo-error" id={idAviso}>
              {escalaIlegible(valor)
                ? `Lo escrito no se pudo leer: se está midiendo con ${MILIMETROS_POR_UNIDAD_POR_OMISION}.`
                : `Tiene que ser mayor que cero: se está midiendo con ${MILIMETROS_POR_UNIDAD_POR_OMISION}.`}
            </p>
          ) : null}
          {ayuda}
        </div>
      )
    }

    case 'seleccion':
      return (
        <div className={`campo${campo.medio ? ' campo-medio' : ''}`}>
          {etiqueta}
          <select
            id={id}
            className="campo-control"
            aria-describedby={describe}
            value={seleccionVisible(campo, valor)}
            onChange={(e) => alCambiar(e.target.value)}
          >
            {!campo.requerido ? <option value="">— sin definir —</option> : null}
            {campo.opciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
          {ayuda}
        </div>
      )

    case 'casilla':
      return (
        <div className="campo campo-casilla">
          <label className="campo-etiqueta-casilla" htmlFor={id}>
            <input
              id={id}
              type="checkbox"
              aria-describedby={describe}
              checked={valor === true}
              onChange={(e) => alCambiar(e.target.checked)}
            />
            <span>{campo.etiqueta}</span>
          </label>
          {ayuda}
        </div>
      )

    case 'relacion':
      if (campo.multiple) {
        // Los identificadores llegan sueltos o como documentos poblados, según
        // la profundidad con la que se leyó: se normalizan antes de comparar,
        // porque «3» y 3 no son la misma casilla marcada.
        const marcados = (Array.isArray(valor) ? valor : [])
          .map((v) => (v && typeof v === 'object' ? (v as { id?: unknown }).id : v))
          .map((v) => texto(v))
          .filter(Boolean)
        const opciones = relaciones[campo.coleccion] ?? []
        return (
          // Las N casillas son un solo campo y hay que anunciarlas como tal.
          // Sueltas, el lector recorre «Placa LCP 3.5, casilla, no marcada»,
          // «Taladro, casilla, no marcada»… y nunca dice de qué va la lista, así
          // que la ayuda —que es la que explica que dejarla vacía no significa
          // «sin instrumental» sino «la componen los pasos»— tampoco llega.
          //
          // Es `role="group"` y no `<fieldset>` a propósito, aunque el caso
          // 'grupo' de aquí abajo sí use fieldset. Aquel lleva `.campo-grupo`,
          // que rehace borde, relleno y margen y además viste su `<legend>`;
          // este tendría que llevar `.campo`, que solo declara `flex` y
          // `min-width`, así que se quedaría con el borde acanalado y el
          // relleno que el navegador le pone a todo fieldset, y su rótulo
          // tendría que dejar de ser el mismo `<span class="campo-etiqueta">`
          // que usan sus vecinos para pasar a `<legend>`. El marco y la
          // etiqueta de este campo quedarían distintos de los de al lado por un
          // arreglo que es de accesibilidad y no de aspecto.
          //
          // Cuando se decidió pesaba también una regla `.campo legend` heredada
          // del simulador viejo (`estilos.css`), que los pintaba en mono y
          // mayúsculas. Esa regla puede desaparecer —era de las que quedaron
          // huérfanas— y la decisión no se mueve: el motivo de arriba no
          // depende de ella.
          <div
            className="campo"
            role="group"
            aria-labelledby={idEtiqueta}
            aria-describedby={describe}
          >
            {rotulo}
            {ayuda}
            <div className="campo-casillas">
              {opciones.length === 0 ? (
                <p className="campo-ayuda">Todavía no hay nada que elegir en ese catálogo.</p>
              ) : (
                opciones.map((o) => (
                  // Sin clase a propósito: lo viste `.campo-casillas label`, por
                  // su sitio. Llevaba `campo-casilla`, que es además el nombre de
                  // la envoltura de un campo booleano, y esa colisión ya volvió
                  // fila flex al aviso de los metadatos DICOM y lo dejó donde
                  // nadie lo lee (el porqué entero está en `admin.css`, junto a
                  // la regla). Perdía por especificidad, así que quitarla no
                  // cambia un píxel; lo que quita es el nombre con dos dueños.
                  <label key={o.id}>
                    <input
                      type="checkbox"
                      checked={marcados.includes(o.id)}
                      onChange={(e) =>
                        alCambiar(
                          e.target.checked
                            ? [...marcados, o.id]
                            : marcados.filter((m) => m !== o.id),
                        )
                      }
                    />
                    <span>{o.etiqueta}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )
      }
      return (
        <div className={`campo${campo.medio ? ' campo-medio' : ''}`}>
          {etiqueta}
          <select
            id={id}
            className="campo-control"
            aria-describedby={describe}
            value={texto(
              valor && typeof valor === 'object' ? (valor as { id?: unknown }).id : valor,
            )}
            onChange={(e) => alCambiar(e.target.value || null)}
          >
            <option value="">— ninguno —</option>
            {(relaciones[campo.coleccion] ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.etiqueta}
              </option>
            ))}
          </select>
          {ayuda}
        </div>
      )

    case 'archivo':
      return (
        <SelectorDeArchivo
          campo={campo}
          valor={valor}
          alCambiar={alCambiar}
          opciones={relaciones[campo.coleccion] ?? []}
          alRecargar={() => alRecargarRelacion?.(campo.coleccion)}
        />
      )

    case 'rico':
      return (
        // El editor es un `div contenteditable` y no un control etiquetable, así
        // que el `for` de una etiqueta no lo nombra. Se había arreglado a
        // medias: el nombre se puso en el grupo, y el grupo no recibe el foco.
        // Quien lo recibe es el `role="textbox"` que TipTap le pone al área
        // editable, y ese seguía sin nombre, de modo que en un formulario de
        // maniobra —tres editores ricos seguidos— el lector anunciaba los tres
        // igual: «cuadro de edición», sin decir de qué campo.
        //
        // Ahora el nombre va en los dos, y cada uno por un motivo. El área
        // editable, porque es donde se escribe. El grupo, porque dentro
        // también está la barra de formato, y tres barras llamadas «Formato
        // del texto» solo se distinguen por el grupo que las contiene.
        //
        // La ayuda, en cambio, va SOLO en el área: es la regla sobre lo que se
        // escribe, y puesta también en el grupo se oiría dos veces seguidas al
        // entrar.
        <div className="campo" role="group" aria-labelledby={idEtiqueta}>
          {rotulo}
          <EditorTextoRico
            valor={valor}
            alCambiar={alCambiar}
            idEtiqueta={idEtiqueta}
            idAyuda={describe}
          />
          {ayuda}
        </div>
      )

    case 'grupo': {
      const modelo =
        campo.editor === 'encuadre3d' ? modeloParaEncuadrar(relaciones, hermanos) : undefined
      return (
        <fieldset className="campo-grupo">
          <legend>{campo.etiqueta}</legend>
          {campo.editor === 'encuadre3d' ? (
            <>
              {/*
                La ayuda del grupo entra dentro del envoltorio que se esconde, y
                no arriba con las demás, porque es la ayuda DEL VISOR: dice «use
                el visor de aquí abajo; los números se rellenan solos»
                (`src/admin/bloques.ts`). Por debajo de 640 px el visor no está
                —encuadrar con el dedo no sale—, y la frase sola mandaba a
                buscar un botón inexistente. Se van los dos juntos y en su sitio
                queda el aviso de al lado; los cinco números siguen editables a
                mano, que es lo que ese aviso tiene que decir.
              */}
              <div className="solo-ancho">
                {ayuda}
                <EditorDeEncuadre
                  url={modelo?.url ?? null}
                  nombre={modelo?.nombre}
                  valor={(valor ?? {}) as Encuadre}
                  alCambiar={(nuevo) =>
                    alCambiar({ ...((valor ?? {}) as Record<string, unknown>), ...nuevo })
                  }
                />
              </div>
              <p className="solo-estrecho aviso-solo-escritorio">
                Encuadrar con el dedo no sale: abra esta ficha desde un computador. Los cinco
                números de aquí abajo siguen siendo editables a mano.
              </p>
            </>
          ) : (
            ayuda
          )}
          <FilaDeCampos
            campos={campo.campos}
            valores={(valor ?? {}) as Record<string, unknown>}
            alCambiar={(nombre, nuevo) =>
              alCambiar({ ...((valor ?? {}) as Record<string, unknown>), [nombre]: nuevo })
            }
            relaciones={relaciones}
            alRecargarRelacion={alRecargarRelacion}
          />
        </fieldset>
      )
    }

    case 'lista':
      return (
        <EditorDeLista
          campo={campo}
          valor={valor}
          alCambiar={alCambiar}
          relaciones={relaciones}
          alRecargarRelacion={alRecargarRelacion}
          // Sin estos dos, el taller de piezas 3D no ve el modelo que se eligió
          // en el campo de al lado y pide que se elija uno que ya está elegido,
          // ni puede escribir el desplazamiento capturado. Se declararon en
          // `EditorDeLista` y no se pasaron aquí: el taller no se dibujaba nunca.
          hermanos={hermanos}
          alCambiarHermano={alCambiarHermano}
        />
      )

    case 'bloques':
      return (
        <EditorDeBloques
          campo={campo}
          valor={valor}
          alCambiar={alCambiar}
          relaciones={relaciones}
          alRecargarRelacion={alRecargarRelacion}
        />
      )

    default:
      return null
  }
}

/** Agrupa campos y deja que los marcados como «medio» compartan línea. */
export function FilaDeCampos({
  campos,
  valores,
  alCambiar,
  relaciones,
  alRecargarRelacion,
}: {
  campos: Campo[]
  valores: Record<string, unknown>
  alCambiar: (nombre: string, valor: unknown) => void
  relaciones: Relaciones
  alRecargarRelacion?: (coleccion: string) => void
}) {
  return (
    <div className="campos">
      {campos.map((campo) => (
        <ControlDeCampo
          key={campo.nombre}
          campo={campo}
          valor={valores[campo.nombre]}
          alCambiar={(nuevo) => alCambiar(campo.nombre, nuevo)}
          relaciones={relaciones}
          alRecargarRelacion={alRecargarRelacion}
          hermanos={valores}
          alCambiarHermano={alCambiar}
        />
      ))}
    </div>
  )
}

// -------------------------------------------------------------------- lista

/**
 * Cuántos milímetros mide una unidad del archivo.
 *
 * Lo que se mide con este número son los seis valores del desplazamiento
 * inicial, y la consola mide después contra ellos la reducción del residente:
 * equivocarlo no da ningún error, da un caso que puntúa mal.
 *
 * Qué cambia de verdad respecto de dejar pasar cualquier `number`, para que no
 * se lea como más de lo que es: el 0, el vacío y el NaN ya acababan en 1000,
 * porque `desplazamientoEnMilimetros` (`src/lib/piezasDelCaso.ts`) hace
 * `milimetrosPorUnidad || 1000` y los tres son falsos. Lo que este guardián
 * caza y aquel `||` dejaba pasar son el **negativo** —un -1 espejaba los seis
 * números, que es peor que equivocar la magnitud porque parece plausible— y el
 * **infinito**, que sale de escribir `1e999` en un `<input type="number">`.
 *
 * La razón de subirlo aquí no es el respaldo en sí, que allá abajo ya existe,
 * sino de quién es la política: el `||` de la función pura es su último
 * cinturón, y quien tiene que decidir con qué se mide —y avisar de que lo está
 * decidiendo, cosa que una función pura no puede hacer— es la pantalla.
 * Decide lo mismo que cuando el campo está vacío, que es lo que promete la
 * ayuda del esquema: glTF trabaja en metros y 1000 es lo normal.
 */
const MILIMETROS_POR_UNIDAD_POR_OMISION = 1000

const escalaDelCaso = (bruto: unknown): number =>
  typeof bruto === 'number' && Number.isFinite(bruto) && bruto > 0
    ? bruto
    : MILIMETROS_POR_UNIDAD_POR_OMISION

/**
 * Si el traumatólogo escribió algo y aun así se está midiendo con el respaldo.
 *
 * Se pregunta comparando contra `escalaDelCaso` en vez de repetir su condición,
 * para que el aviso no pueda separarse del número que se usa: cualquier
 * política nueva que se ponga ahí arriba queda anunciada sola. El campo vacío
 * no avisa —llega como `''` desde `documentoEnBlanco` y como `null` desde la
 * base— porque ahí el 1000 no corrige a nadie, solo cumple lo que la ayuda del
 * esquema ya dice.
 */
const escalaSustituida = (bruto: unknown): boolean =>
  bruto !== null &&
  bruto !== undefined &&
  bruto !== '' &&
  escalaDelCaso(bruto) !== bruto

/**
 * Cuándo el número que se sustituye ni siquiera se ve en su casilla.
 *
 * `<input type="number">` sanea lo que se le asigna: si `String(valor)` no es
 * un número en punto flotante válido, el navegador deja la casilla vacía, y ni
 * «Infinity» ni «NaN» lo son. El caso que llega de verdad es el infinito
 * —`1e999` es una cifra que el control acepta teclear y `Number()` la convierte
 * en `Infinity`—: la casilla se vacía sola, y ahí el aviso de «mayor que cero»
 * manda a corregir un cero que nadie ve y deja al traumatólogo buscando un
 * número que la pantalla ya no enseña. Por eso este caso dice otra cosa: que lo
 * escrito no se pudo leer y el campo quedó en blanco. El `NaN` va aquí por lo
 * mismo, aunque hoy no haya manera de teclearlo —el `onChange` del campo
 * convierte el vacío en `null`—; si algún día llega, se ve igual de vacío.
 *
 * Lo que no cambia es la medida: los dos se miden con el respaldo, como el
 * campo vacío.
 */
const escalaIlegible = (bruto: unknown): boolean =>
  typeof bruto === 'number' && !Number.isFinite(bruto)

/**
 * Qué casilla es la escala del caso.
 *
 * El mismo nombre que el taller lee en `hermanos?.milimetrosPorUnidad`, aquí
 * abajo; los ata `tests/unit/escalaEnSuCasilla.test.ts`, porque si se separan
 * la casilla deja de cerrarse sin que nada falle.
 */
const CAMPO_DE_ESCALA = 'milimetrosPorUnidad'

/**
 * Hasta dónde bajan las flechas en la casilla de la escala. No es la política.
 *
 * Lo que decide si una escala vale sigue siendo `escalaDelCaso` —cualquier
 * número finito mayor que cero— y no se toca, porque la consola decide lo mismo
 * en `escalaPositiva` (`src/lib/casoQuirurgico.ts`): si la casilla rechazara un
 * 0,5 que la consola acepta, el taller mediría con 1000 y el residente con 0,5.
 * Este número solo gobierna las flechas, y está medido en Chromium, no supuesto:
 *
 *  - Con `step="any"` las flechas avanzan de uno en uno y **no** se alinean con
 *    el mínimo: desde 1000 bajan a 999 con este suelo o con cualquier otro.
 *  - Una flecha que dejaría el valor por debajo del mínimo no hace nada: desde
 *    1 hacia abajo se queda en 1, desde 1,5 se queda en 1,5. Así que desde
 *    cualquier escala de 1 para arriba el teclado ya no llega al 0 ni al -1.
 *  - Con la casilla vacía, cualquier flecha escribe el mínimo. Por eso 1 y no
 *    un número diminuto como 0,001: con aquel, pulsar una flecha en la casilla
 *    vacía escribía una escala que encoge el hueso mil veces y que el guardián
 *    da por buena. 1 es «exporté en milímetros», que la ayuda nombra.
 *
 * Lo que queda y se sabe: un 0,5 **tecleado** se sigue usando, y el navegador
 * lo considera por debajo del mínimo. No bloquea nada —el panel no valida con el
 * formulario nativo—, y para que el lector no lo anuncie como erróneo mientras
 * la plataforma lo usa, la casilla declara `aria-invalid` siempre, verdadero o
 * falso, según `escalaSustituida` y no según el navegador.
 *
 * **No va como `min` en `src/admin/esquema.ts`**, aunque parezca su sitio.
 * `depurarCampo` recorta contra ese `min` al guardar y sin decir nada (D-083):
 * un 0 guardado se volvería 1 —milímetros— en vez de caer al respaldo de 1000,
 * y el caso quedaría mil veces más pequeño sin que ninguna pantalla lo
 * enseñara. El suelo es de la casilla y solo de la casilla.
 */
const SUELO_DE_LAS_FLECHAS = 1

function EditorDeLista({
  campo,
  valor,
  alCambiar,
  relaciones,
  alRecargarRelacion,
  hermanos,
  alCambiarHermano,
}: Props & { campo: Extract<Campo, { tipo: 'lista' }> }) {
  const filas = Array.isArray(valor) ? (valor as Record<string, unknown>[]) : []

  const cambiar = (nuevas: Record<string, unknown>[]) => alCambiar(nuevas)

  const singular = campo.singular.toLowerCase()

  const modelo =
    campo.editor === 'piezas3d'
      ? opcionDeRelacion(relaciones, 'modelos-3d', hermanos?.modelo)
      : undefined

  const mover = (indice: number, direccion: -1 | 1) => {
    const destino = indice + direccion
    if (destino < 0 || destino >= filas.length) return
    const copia = [...filas]
    ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
    cambiar(copia)
  }

  const quitar = (indice: number) => {
    // La misma pregunta que ya hace el editor de bloques, y por la misma razón:
    // una fila de «Pasos del guion» lleva descripción, principio y nota, y con
    // el foco sin recoger no queda ni rastro en pantalla de lo que se perdió.
    if (!confirm(`¿Quitar ${singular} ${indice + 1}? Se pierde lo que tenga escrito.`)) return
    cambiar(filas.filter((_, j) => j !== indice))
  }

  return (
    <div className="campo lista">
      <div className="lista-cabecera">
        <span className="campo-etiqueta">{campo.etiqueta}</span>
        <span className="lista-conteo">
          {filas.length} {filas.length === 1 ? singular : 'en total'}
        </span>
      </div>
      {campo.ayuda ? <p className="campo-ayuda">{campo.ayuda}</p> : null}

      {campo.editor === 'piezas3d' ? (
        <>
          {/* El aviso va aquí y no junto al campo de «Milímetros por unidad»
              porque es aquí donde el número se gasta: el botón de capturar
              escribe los seis valores medidos con él, y hasta ahora la única
              pista de que se estaba usando 1000 en vez del 0 escrito era que
              las cifras salían raras. El campo está en la misma pestaña, unas
              líneas más arriba. */}
          {escalaSustituida(hermanos?.milimetrosPorUnidad) ? (
            <p className="campo-error" role="alert">
              {escalaIlegible(hermanos?.milimetrosPorUnidad)
                ? `El número de «Milímetros por unidad» no se pudo leer y la casilla quedó en blanco. Se está midiendo con ${MILIMETROS_POR_UNIDAD_POR_OMISION}, que es lo normal en glTF.`
                : `«Milímetros por unidad» tiene que ser un número mayor que cero. Se está midiendo con ${MILIMETROS_POR_UNIDAD_POR_OMISION}, que es lo normal en glTF.`}
            </p>
          ) : null}
          <TallerDePiezas
            url={modelo?.url ?? null}
            nombre={modelo?.etiqueta}
            piezas={filas}
            alCambiarPiezas={cambiar}
            desplazamiento={(hermanos?.desplazamientoInicial ?? {}) as DesplazamientoInicial}
            alCambiarDesplazamiento={(nuevo) =>
              alCambiarHermano?.('desplazamientoInicial', nuevo)
            }
            milimetrosPorUnidad={escalaDelCaso(hermanos?.milimetrosPorUnidad)}
          />
        </>
      ) : null}

      {filas.map((fila, i) => (
        <div className="lista-fila" key={claveDe(fila, i)}>
          <div className="lista-fila-barra">
            <span className="lista-fila-numero">
              {campo.singular} {i + 1}
            </span>
            <div className="lista-fila-acciones">
              {/* El nombre accesible de un botón lo da su contenido y solo cae
                  al `title` si ese contenido queda vacío: con «↑» dentro, el
                  título era texto muerto y el lector anunciaba el glifo. Con
                  seis pasos son dieciocho botones llamados por un símbolo, así
                  que el número de fila va también en el nombre. */}
              <button
                type="button"
                onClick={() => mover(i, -1)}
                disabled={i === 0}
                title={`Subir ${singular} ${i + 1}`}
                aria-label={`Subir ${singular} ${i + 1}`}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => mover(i, 1)}
                disabled={i === filas.length - 1}
                title={`Bajar ${singular} ${i + 1}`}
                aria-label={`Bajar ${singular} ${i + 1}`}
              >
                ↓
              </button>
              <button
                type="button"
                className="lista-quitar"
                onClick={() => quitar(i)}
                title={`Quitar ${singular} ${i + 1}`}
                aria-label={`Quitar ${singular} ${i + 1}`}
              >
                ✕
              </button>
            </div>
          </div>
          <FilaDeCampos
            campos={campo.campos}
            valores={fila}
            alCambiar={(nombre, nuevo) =>
              cambiar(filas.map((f, j) => (j === i ? { ...f, [nombre]: nuevo } : f)))
            }
            relaciones={relaciones}
            alRecargarRelacion={alRecargarRelacion}
          />
        </div>
      ))}

      <button
        type="button"
        className="admin-btn admin-btn-secondary"
        onClick={() =>
          cambiar([
            ...filas,
            { ...valoresPorOmision(campo.campos), [CLAVE_DE_FILA]: nuevaClave() },
          ])
        }
      >
        + Agregar {singular}
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ bloques

function EditorDeBloques({
  campo,
  valor,
  alCambiar,
  relaciones,
  alRecargarRelacion,
}: Props & { campo: Extract<Campo, { tipo: 'bloques' }> }) {
  const bloques = Array.isArray(valor) ? (valor as Record<string, unknown>[]) : []
  /**
   * Plegado por identidad del bloque y no por su posición.
   *
   * Las flechas y el botón de quitar reordenan el arreglo y este mapa no se
   * movía con ellos: subir un bloque plegado lo devolvía desplegado y plegaba
   * al que había bajado, y quitar el segundo de seis cerraba de golpe uno que
   * estaba abierto y a medio escribir. Quien no conoce el detalle lo lee como
   * que el editor borró el contenido.
   */
  const [plegados, setPlegados] = useState<Record<string, boolean>>({})
  const [agregando, setAgregando] = useState(false)

  const disparador = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const anterior = useRef(agregando)

  /**
   * Abrir y cerrar el menú desmonta el elemento que tiene el foco, y entonces
   * cae al `<body>`: el siguiente tabulador no lleva al menú que acaba de
   * aparecer sino al principio de la página, y hay que recorrer barra lateral,
   * migas, pestañas y todos los campos ya escritos para volver. Con doce
   * bloques en una ficha ese paseo se repite doce veces.
   *
   * Al montar no se toca nada: el foco no es suyo todavía y robarlo movería la
   * página sola nada más abrir la ficha.
   *
   * Lo que guarda el centinela es el valor anterior de `agregando`, no un «ya
   * monté». Un booleano de primera vuelta no sobrevive al Modo Estricto, que
   * `next dev` deja activo por omisión desde 13.5.1 con el App Router y que
   * `next.config.mjs` no desactiva: React monta, limpia y vuelve a montar los
   * efectos, pero los `useRef` no se reinician entre ambas vueltas, así que la
   * segunda encontraba el centinela puesto, caía al `else` y enfocaba el
   * disparador con el menú cerrado. Cada `EditorDeBloques` arrastraba la página
   * hasta su «+ Agregar bloque» al abrir la ficha y en cada cambio de pestaña.
   * Comparando contra el valor anterior las dos vueltas coinciden y no dispara
   * nada.
   */
  useEffect(() => {
    if (anterior.current === agregando) return
    anterior.current = agregando
    if (agregando) menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    else disparador.current?.focus()
  }, [agregando])

  const cambiar = (nuevos: Record<string, unknown>[]) => alCambiar(nuevos)

  const mover = (indice: number, direccion: -1 | 1) => {
    const destino = indice + direccion
    if (destino < 0 || destino >= bloques.length) return
    const copia = [...bloques]
    ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
    cambiar(copia)
  }

  return (
    <div className="campo bloques">
      <div className="lista-cabecera">
        <span className="campo-etiqueta">{campo.etiqueta}</span>
        <span className="lista-conteo">
          {bloques.length} bloque{bloques.length === 1 ? '' : 's'}
        </span>
      </div>
      {campo.ayuda ? <p className="campo-ayuda">{campo.ayuda}</p> : null}

      {bloques.length === 0 ? (
        <p className="bloques-vacio">
          Esta pestaña está vacía. Agregue el primer bloque para empezar a escribir.
        </p>
      ) : null}

      {bloques.map((bloque, i) => {
        const esquema = bloqueDe(String(bloque.blockType ?? ''))
        if (!esquema) return null
        const clave = claveDe(bloque, i)
        const plegado = plegados[clave] === true
        const nombreDelBloque = esquema.nombre.toLowerCase()
        return (
          <div className={`bloque-editor${plegado ? ' bloque-plegado' : ''}`} key={clave}>
            <div className="bloque-barra">
              <button
                type="button"
                className="bloque-plegar"
                // Forma funcional: leer `plegados` del render en curso hacía
                // que dos plegados rápidos seguidos se pisaran.
                onClick={() => setPlegados((previos) => ({ ...previos, [clave]: !plegado }))}
                title={`${plegado ? 'Desplegar' : 'Plegar'} ${nombreDelBloque} ${i + 1}`}
                aria-label={`${plegado ? 'Desplegar' : 'Plegar'} ${nombreDelBloque} ${i + 1}`}
                aria-expanded={!plegado}
              >
                {plegado ? '▸' : '▾'}
              </button>
              <span className="bloque-tipo">{esquema.nombre}</span>
              <span className="bloque-resumen">{esquema.resumen(bloque)}</span>
              <div className="lista-fila-acciones">
                <button
                  type="button"
                  onClick={() => mover(i, -1)}
                  disabled={i === 0}
                  title={`Subir ${nombreDelBloque} ${i + 1}`}
                  aria-label={`Subir ${nombreDelBloque} ${i + 1}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => mover(i, 1)}
                  disabled={i === bloques.length - 1}
                  title={`Bajar ${nombreDelBloque} ${i + 1}`}
                  aria-label={`Bajar ${nombreDelBloque} ${i + 1}`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="lista-quitar"
                  onClick={() => {
                    if (confirm('¿Quitar este bloque? Se pierde lo que tenga escrito.')) {
                      cambiar(bloques.filter((_, j) => j !== i))
                    }
                  }}
                  title={`Quitar ${nombreDelBloque} ${i + 1}`}
                  aria-label={`Quitar ${nombreDelBloque} ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            </div>
            {!plegado ? (
              <div className="bloque-cuerpo">
                <FilaDeCampos
                  campos={esquema.campos}
                  valores={bloque}
                  alCambiar={(nombre, nuevo) =>
                    cambiar(bloques.map((b, j) => (j === i ? { ...b, [nombre]: nuevo } : b)))
                  }
                  relaciones={relaciones}
                  alRecargarRelacion={alRecargarRelacion}
                />
              </div>
            ) : null}
          </div>
        )
      })}

      {agregando ? (
        <div className="bloques-menu" ref={menu}>
          {BLOQUES.map((b) => (
            <button
              key={b.slug}
              type="button"
              className="bloques-menu-opcion"
              onClick={() => {
                cambiar([
                  ...bloques,
                  {
                    blockType: b.slug,
                    ...valoresPorOmision(b.campos),
                    [CLAVE_DE_FILA]: nuevaClave(),
                  },
                ])
                setAgregando(false)
              }}
            >
              {b.nombre}
            </button>
          ))}
          <button
            type="button"
            className="bloques-menu-opcion bloques-menu-cancelar"
            onClick={() => setAgregando(false)}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          ref={disparador}
          onClick={() => setAgregando(true)}
        >
          + Agregar bloque
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ archivo

/**
 * Por qué el peso se pregunta aquí, antes de mandar nada.
 *
 * El techo lo declara la colección —`subida.maximoBytes` en
 * `src/admin/esquema.ts`— y quien lo hace cumplir es la ruta de subida
 * (`src/app/(frontend)/api/subidas/[coleccion]/route.ts`), que corta nada más
 * leer `Content-Length`. Así que esto ya no tapa un corte mudo, como tapaba
 * cuando la subida iba por la acción `subirArchivo` y Next descartaba el cuerpo
 * sin invocarla: hoy la ruta contestaría el mismo mensaje. Lo que ahorra es la
 * petición entera —abrir la conexión por el túnel para oír un «no»— y la
 * barra de avance que asomaría un instante para desaparecer. El texto es el
 * mismo que compone la ruta, porque es el mismo rechazo visto desde dos sitios.
 *
 * El número ya no se repite en esta pantalla: sale del esquema, que es de donde
 * sale también la frase que lo anuncia. Había un 7 escrito aquí que valía para
 * las dos colecciones, y en modelos 3D era mentira —ahí el techo son 5 MB, los
 * que `validarModelo3D` rechaza por firma—, de modo que un `.glb` de 6 MB
 * viajaba entero para que el servidor lo rehusara.
 */
const enMegas = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',')

/** El techo dicho como lo dice `subida.ayuda`: en megabytes enteros. */
const techoEnMegas = (bytes: number): string => String(Math.round(bytes / (1024 * 1024)))

/**
 * Lo que la colección de destino declara sobre sus subidas.
 *
 * `subida.ayuda` estaba escrito en el esquema y no se pintaba en ningún sitio,
 * de modo que el techo de peso y los formatos aceptados solo existían en el
 * código. Se busca sin `esquemaDe`, que lanza: un campo de archivo apunta
 * siempre a una colección real, pero una pantalla de edición no es el sitio
 * donde reventar por eso.
 */
const subidaDe = (slug: string) => ESQUEMAS.find((e) => e.slug === slug)?.subida

function SelectorDeArchivo({
  campo,
  valor,
  alCambiar,
  opciones,
  alRecargar,
}: {
  campo: Extract<Campo, { tipo: 'archivo' }>
  valor: unknown
  alCambiar: (nuevo: unknown) => void
  opciones: OpcionRelacion[]
  alRecargar: () => void
}) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  /**
   * La subida en marcha: de qué archivo se habla y cuánto ha viajado.
   *
   * Es la misma forma que el `progreso` de `TablaDocumentos.tsx` sin la cuenta
   * de la tanda, porque aquí se sube uno. `null` es «no hay subida», y de ahí
   * sale `enCurso`: guardarlo aparte serían dos estados que dicen lo mismo y
   * que pueden quedar en desacuerdo si una rama olvida bajar uno de los dos.
   *
   * Antes esto era un `useTransition`, que sabe si la acción terminó pero no
   * cuánto le falta. Con la acción daba igual, porque tampoco había nada que
   * medir; con un vídeo de 40 MB por un túnel doméstico son minutos con el
   * botón en «Subiendo…» y ninguna señal de vida, y lo que hace cualquiera
   * entonces es recargar la ficha a medio escribir.
   */
  const [progreso, setProgreso] = useState<{ nombre: string; fraccion: number } | null>(null)
  const enCurso = progreso !== null
  /**
   * Quién recibe el archivo cuando por fin termina de subir.
   *
   * El `alCambiar` de las props se lee **al terminar**, no al empezar, y la
   * diferencia no es de estilo. El que llega aquí lo compone `EditorDeBloques`
   * con el arreglo de bloques del render en que se pulsó el botón; con la
   * acción eso eran unos segundos, pero una subida que dura minutos invita
   * justo a seguir escribiendo mientras tanto, y al terminar se habría escrito
   * aquel arreglo viejo entero encima de la ficha: todo lo tecleado durante la
   * subida, en cualquier otro bloque, desaparecido sin aviso. Leyendo el último
   * se escribe sobre la ficha tal como está.
   *
   * Si este selector se desmonta a mitad de subida no se escribe nada, porque
   * el último `alCambiar` que vio ya no es el último de la ficha. Pasa en dos
   * casos y el primero es el que obliga: quitar el bloque, donde ese
   * `alCambiar` lleva el arreglo de antes de quitarlo y llamarlo lo resucitaría.
   * El segundo es el caro: **plegar** el bloque también lo desmonta
   * (`EditorDeBloques` no pinta el cuerpo plegado), y ahí escribir con aquel
   * arreglo borraría lo tecleado después en otros bloques. Así que tampoco se
   * escribe, y lo que se hace es recargar las opciones: el archivo queda subido
   * y al desplegar aparece en el desplegable para elegirlo, en vez de no estar
   * en ninguna parte hasta recargar la página. Lo que lo arreglaría del todo es
   * que cada nivel del formulario escriba sobre el valor vigente y no sobre el
   * de su render, y eso ya no es de este selector.
   */
  const ultimos = useRef({ alCambiar, alRecargar })
  useEffect(() => {
    ultimos.current = { alCambiar, alRecargar }
  }, [alCambiar, alRecargar])
  // No es el centinela de «primera vuelta» que el Modo Estricto derrota (ver
  // `EditorDeBloques`): no recuerda si ya se montó, dice si está montado ahora,
  // y el efecto lo vuelve a poner en cada montaje, también en la segunda vuelta
  // del Modo Estricto, después de que la limpieza de la primera lo bajara.
  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])
  /**
   * El `<input type="file">` sigue existiendo, pero ya no es el control.
   *
   * Estaba `hidden` dentro de un `<label>`, y eso es un botón solo para el
   * ratón: `hidden` equivale a `display:none`, así que el input queda fuera del
   * orden de tabulación y del árbol de accesibilidad, y un `<label>` no recibe
   * foco porque no es un elemento tabulable. Quien trabaja con teclado o con
   * lector no podía subir una sola imagen, un video ni un modelo.
   */
  const entrada = useRef<HTMLInputElement>(null)

  const subida = subidaDe(campo.coleccion)
  const idAyuda = `${id}-ayuda`
  const idSubida = `${id}-subida`
  const idError = `${id}-error`
  const describe =
    [campo.ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined

  const actual = valor && typeof valor === 'object' ? (valor as { id?: unknown }).id : valor
  const seleccionado = opciones.find((o) => o.id === String(actual ?? ''))

  const subir = (archivo: File) => {
    setError(null)
    if (subida && archivo.size > subida.maximoBytes) {
      setError(
        `«${archivo.name}» pesa ${enMegas(archivo.size)} MB y el máximo son ` +
          `${techoEnMegas(subida.maximoBytes)} MB. Comprímalo, o recorte el video, antes de subirlo.`,
      )
      return
    }
    // A cero antes de empezar, como en el listado: la barra aparece con el
    // nombre del archivo en cuanto arranca y no con el primer evento de avance,
    // que en un archivo grande puede tardar segundos.
    const avisar = (fraccion: number) => setProgreso({ nombre: archivo.name, fraccion })
    avisar(0)
    void (async () => {
      try {
        // Por la ruta y no por la acción `subirArchivo`: el porqué entero está
        // en `src/admin/subidas.ts`, y lo que costaba no haberlo hecho, en
        // `next.config.mjs`.
        const resultado = await subidorQueAvisa(avisar)(
          formularioDeArchivo(campo.coleccion, archivo),
        )
        if (!montado.current) {
          if (resultado.exito) ultimos.current.alRecargar()
          return
        }
        if (resultado.exito && resultado.datos) {
          ultimos.current.alCambiar(resultado.datos.id)
          ultimos.current.alRecargar()
        } else {
          setError(resultado.mensaje ?? 'No se pudo subir el archivo.')
        }
      } catch (fallo) {
        // El subidor devuelve una `Respuesta` también cuando la red se corta o
        // contesta un proxy, así que por aquí solo cae una avería del propio
        // navegador —un `setRequestHeader` que no acepta el valor, por
        // ejemplo—. Sin este `catch` se perdería en la consola y el botón
        // se quedaría en «Subiendo…» para siempre, que es como se perdió una
        // vez lo que rechazaba el marco.
        if (!montado.current) return
        setError(
          fallo instanceof Error && fallo.message
            ? `No se pudo subir el archivo: ${fallo.message}`
            : 'No se pudo subir el archivo. Compruebe la conexión e inténtelo otra vez.',
        )
      } finally {
        if (montado.current) setProgreso(null)
      }
    })()
  }

  return (
    <div className="campo">
      <label className="campo-etiqueta" htmlFor={id}>
        {campo.etiqueta}
        {campo.requerido ? <span className="campo-obligatorio"> *</span> : null}
      </label>

      <div className="archivo-fila">
        <select
          id={id}
          className="campo-control"
          aria-describedby={describe}
          value={String(actual ?? '')}
          onChange={(e) => alCambiar(e.target.value || null)}
        >
          <option value="">— ninguno —</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </select>
        {/* `aria-disabled` y no `disabled`: este botón es el que tiene el foco
            justo cuando la subida arranca —el selector de archivo lo devuelve
            aquí al cerrarse—, y desactivarlo con el foco dentro lo suelta en el
            `<body>`, de modo que el siguiente tabulador no sigue por el
            formulario sino que vuelve al principio de la página, en mitad de
            una ficha a medio escribir. Quien avisa de que está ocupado es el
            rótulo, y la doble pulsación la corta el `if (enCurso) return`. Es lo
            mismo que hacen el subidor de `TablaDocumentos.tsx` y las filas de
            `TablaUsuarios.tsx`. */}
        <button
          type="button"
          className="admin-btn admin-btn-secondary archivo-subir"
          aria-disabled={enCurso}
          aria-describedby={subida?.ayuda ? idSubida : undefined}
          onClick={() => {
            if (enCurso) return
            entrada.current?.click()
          }}
        >
          {enCurso ? 'Subiendo…' : 'Subir nuevo'}
        </button>
        <input
          ref={entrada}
          type="file"
          hidden
          accept={campo.acepta ?? subida?.acepta}
          disabled={enCurso}
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            if (archivo) subir(archivo)
            e.target.value = ''
          }}
        />
      </div>

      {/*
        La barra, calcada de la del listado de medios (`TablaDocumentos.tsx`),
        y con sus mismas dos decisiones, que allí están explicadas enteras:

         - La región viva se queda montada aunque no haya subida, porque un
           `role="status"` que aparece junto con su texto no lo anuncia ningún
           lector. Dentro va el nombre del archivo y NO el porcentaje, que
           cambia decenas de veces y convertiría el aviso en una letanía; el
           porcentaje se lee del `<progress>`.
         - Al llegar al 100 % no ha terminado: falta que el servidor escriba el
           archivo, saque las miniaturas y cree el registro. Decirlo evita la
           lectura «se colgó al final», que es la que lleva a recargar.

        Aquí pesa más que allá. En el listado no hay nada a medio escribir; en
        este formulario, recargar por impaciencia se lleva la ficha.
      */}
      <div role="status">
        {progreso ? (
          <p className="campo-ayuda">{`Subiendo «${progreso.nombre}».`}</p>
        ) : null}
      </div>
      {progreso ? (
        <p className="campo-ayuda">
          <progress
            style={{ width: '100%' }}
            max={100}
            value={Math.round(progreso.fraccion * 100)}
            aria-label={`Avance de la subida de «${progreso.nombre}»`}
          />
          {progreso.fraccion >= 1
            ? ' Procesando en el servidor…'
            : ` ${Math.round(progreso.fraccion * 100)} %`}
        </p>
      ) : null}

      {subida?.ayuda ? (
        <p className="campo-ayuda" id={idSubida}>
          {subida.ayuda}
        </p>
      ) : null}

      {/* Con el error solo pintado, la pantalla enseñaba texto rojo que nada
          anunciaba mientras el desplegable seguía diciendo «— ninguno —»: el
          editor creía que el archivo se había adjuntado. */}
      {error ? (
        <p className="campo-error" id={idError} role="alert">
          {error}
        </p>
      ) : null}

      {seleccionado?.url ? (
        <div className="archivo-vista">
          {seleccionado.tipo?.startsWith('video/') ? (
            <video src={seleccionado.url} controls preload="metadata" />
          ) : (
            <img src={seleccionado.url} alt={seleccionado.etiqueta} />
          )}
        </div>
      ) : null}

      {campo.ayuda ? (
        <p className="campo-ayuda" id={idAyuda}>
          {campo.ayuda}
        </p>
      ) : null}
    </div>
  )
}
