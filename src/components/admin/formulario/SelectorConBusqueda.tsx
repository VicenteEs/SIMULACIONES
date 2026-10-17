'use client'

import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import { agregarAlCatalogo } from '@/app/(frontend)/acciones/contenido'
import { ContextoDeFicha } from './contextoDeFicha'
import {
  CATALOGOS_AMPLIABLES,
  filtrarOpciones,
  hayQueOfrecerAgregar,
  paraComparar,
} from '@/lib/catalogosAmpliables'

/**
 * Un desplegable de relación que se **escribe**: la lista se filtra con lo que
 * se teclea, y en los catálogos que lo admiten ofrece «¿No está? Agregar».
 *
 * Sustituye al `<select>` de siempre en todas las relaciones del formulario del
 * caso. Con setenta instrumentos y cuarenta modelos, un `<select>` obliga a
 * recorrer la lista entera con el ratón; con el cuadro escrito, «hohm» deja solo
 * el separador de Hohmann. Y en hueso, clasificación, técnica y fase, lo que el
 * editor busca y no encuentra se agrega ahí mismo y queda en la base para la
 * próxima vez (`agregarAlCatalogo`), en vez de mandarlo a otra pantalla a crear
 * la fila y volver.
 *
 * Es el patrón «combobox con lista» de ARIA 1.2: el cuadro lleva `role="combobox"`
 * y la lista `role="listbox"`, con flechas, Intro y Escape. El foco no sale
 * nunca del cuadro de texto —la opción marcada se anuncia por
 * `aria-activedescendant`—, que es lo que permite seguir escribiendo mientras se
 * recorre la lista.
 *
 * Sirve para uno solo y para varios (`multiple`, la bandeja del caso): en ese caso
 * lo elegido se ve como fichas encima del cuadro, y la lista queda abierta al
 * marcar para poder marcar la siguiente sin volver a abrirla.
 */

export interface Opcion {
  id: string
  etiqueta: string
}

interface PropsComunes {
  /** Para enlazar la etiqueta del campo con el cuadro. */
  id: string
  idDeLaAyuda?: string
  opciones: Opcion[]
  /** Colección a la que apunta la relación: decide si se puede agregar y a qué. */
  coleccion: string
  /** Cuando agregar cambia lo que el resto del formulario tiene cargado. */
  alRecargar?: () => void
  /** Texto del cuadro cuando no hay nada elegido. */
  marcador?: string
  /** Si la cuenta no puede escribir, el desplegable no ofrece agregar. */
  puedeAgregar?: boolean
  /** La etiqueta del campo, para el aviso que se deja al agregar una fila: «desde el campo «Técnica»». */
  etiquetaDelCampo?: string
}

type Props =
  | (PropsComunes & {
      multiple?: false
      valor: string
      alCambiar: (nuevo: string | null) => void
      /** Un campo obligatorio no ofrece «ninguno». */
      requerido?: boolean
    })
  | (PropsComunes & {
      multiple: true
      valor: string[]
      alCambiar: (nuevo: string[]) => void
      requerido?: boolean
    })

export function SelectorConBusqueda(props: Props) {
  const { id, idDeLaAyuda, coleccion, alRecargar, marcador, puedeAgregar = true, etiquetaDelCampo } = props
  const ficha = useContext(ContextoDeFicha)
  const idLista = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  const cuadro = useRef<HTMLInputElement>(null)

  const [abierto, setAbierto] = useState(false)
  const [escrito, setEscrito] = useState('')
  const [activo, setActivo] = useState(0)
  // Lo agregado en esta pantalla, para poder elegirlo y verlo en el acto: la
  // lista que llega de arriba se recarga en segundo plano y tarda unos instantes.
  const [agregadas, setAgregadas] = useState<Opcion[]>([])
  const [formulario, setFormulario] = useState<{ nombre: string; codigo: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // El aviso de «se agregó» no se queda para siempre en pantalla: cumple y se va.
  useEffect(() => {
    if (!aviso) return
    const reloj = window.setTimeout(() => setAviso(null), 7000)
    return () => window.clearTimeout(reloj)
  }, [aviso])

  const todas = useMemo(() => {
    const ids = new Set(props.opciones.map((o) => o.id))
    return [...props.opciones, ...agregadas.filter((a) => !ids.has(a.id))]
  }, [props.opciones, agregadas])

  const catalogo = puedeAgregar ? CATALOGOS_AMPLIABLES[coleccion] : undefined
  const filtradas = useMemo(() => filtrarOpciones(todas, escrito), [todas, escrito])
  const ofreceAgregar = !!catalogo && hayQueOfrecerAgregar(todas, escrito)

  const elegidos: string[] = props.multiple ? props.valor : props.valor ? [props.valor] : []
  const etiquetaElegida = !props.multiple ? (todas.find((o) => o.id === props.valor)?.etiqueta ?? '') : ''

  // Las filas de la lista, en el orden en que se recorren con las flechas: «ninguno» (si se puede), las
  // opciones filtradas y al final «agregar».
  type Fila =
    | { tipo: 'ninguno' }
    | { tipo: 'opcion'; opcion: Opcion }
    | { tipo: 'agregar' }
  const filas: Fila[] = [
    ...(!props.multiple && !props.requerido && escrito.trim() === '' ? [{ tipo: 'ninguno' } as Fila] : []),
    ...filtradas.map((opcion) => ({ tipo: 'opcion', opcion }) as Fila),
    ...(ofreceAgregar ? [{ tipo: 'agregar' } as Fila] : []),
  ]
  const filaActiva = Math.min(activo, Math.max(0, filas.length - 1))

  // Se cierra al pinchar fuera. Un `onBlur` del contenedor se disparaba al pinchar una opción y la lista
  // desaparecía antes de que el clic llegara a ella.
  useEffect(() => {
    if (!abierto) return
    const fuera = (evento: PointerEvent) => {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false)
        setEscrito('')
        setFormulario(null)
        setError(null)
      }
    }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto])

  // La opción marcada con las flechas tiene que estar a la vista aunque la lista tenga cuarenta.
  useEffect(() => {
    if (!abierto) return
    document.getElementById(`${idLista}-fila-${filaActiva}`)?.scrollIntoView({ block: 'nearest' })
  }, [abierto, filaActiva, idLista])

  function abrir() {
    if (abierto) return
    setAbierto(true)
    setEscrito('')
    setActivo(0)
    setError(null)
    setFormulario(null)
  }

  function cerrar() {
    setAbierto(false)
    setEscrito('')
    setFormulario(null)
    setError(null)
  }

  function elegir(opcion: Opcion) {
    if (props.multiple) {
      const ya = props.valor.includes(opcion.id)
      props.alCambiar(ya ? props.valor.filter((v) => v !== opcion.id) : [...props.valor, opcion.id])
      // Sigue abierta y el cuadro vuelve a vacío: se marca una detrás de otra.
      setEscrito('')
      cuadro.current?.focus()
      return
    }
    props.alCambiar(opcion.id)
    cerrar()
  }

  async function agregar(nombre: string, codigo: string) {
    if (!catalogo) return
    setOcupado(true)
    setError(null)
    // De dónde se agrega, para el comentario que le llega a la administración (P-003, E1).
    const respuesta = await agregarAlCatalogo(
      coleccion,
      { nombre, codigo },
      ficha ? { coleccion: ficha.coleccion, documentoId: ficha.documentoId, campo: etiquetaDelCampo ?? '' } : undefined,
    )
    setOcupado(false)
    if (!respuesta.exito || !respuesta.datos) {
      setError(respuesta.mensaje ?? 'No se pudo agregar. Inténtelo de nuevo.')
      return
    }
    const nueva: Opcion = { id: respuesta.datos.id, etiqueta: respuesta.datos.etiqueta }
    setAgregadas((previas) => [...previas, nueva])
    alRecargar?.()
    setAviso(
      respuesta.datos.yaExistia
        ? `«${nueva.etiqueta}» ya estaba en la lista: se eligió.`
        : `«${nueva.etiqueta}» se agregó a la lista y quedó guardado para los próximos casos.`,
    )
    elegir(nueva)
    cerrar()
  }

  function alPulsarAgregar() {
    if (!catalogo) return
    const nombre = escrito.trim()
    // Con un campo más que pedir (el número AO del hueso, el código de la clasificación) se abre un mini
    // formulario; sin él, un solo clic agrega.
    if (catalogo.extra) setFormulario({ nombre, codigo: '' })
    else void agregar(nombre, '')
  }

  function alPulsarTecla(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!abierto) abrir()
      else setActivo(Math.min(filas.length - 1, filaActiva + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo(Math.max(0, filaActiva - 1))
    } else if (e.key === 'Enter') {
      if (!abierto) return
      e.preventDefault()
      const fila = filas[filaActiva]
      if (!fila) return
      if (fila.tipo === 'ninguno') {
        if (!props.multiple) props.alCambiar(null)
        cerrar()
      } else if (fila.tipo === 'opcion') elegir(fila.opcion)
      else alPulsarAgregar()
    } else if (e.key === 'Escape') {
      if (abierto) {
        e.preventDefault()
        e.stopPropagation()
        cerrar()
      }
    } else if (e.key === 'Tab') {
      cerrar()
    }
  }

  const quitar = (idQuitado: string) => {
    if (props.multiple) props.alCambiar(props.valor.filter((v) => v !== idQuitado))
  }

  return (
    <div className="selector-busqueda" ref={contenedor}>
      {props.multiple && elegidos.length > 0 ? (
        <ul className="selector-fichas" aria-label="Elegidos">
          {elegidos.map((e) => {
            const etiqueta = todas.find((o) => o.id === e)?.etiqueta ?? `#${e}`
            return (
              <li key={e} className="selector-ficha">
                <span>{etiqueta}</span>
                <button
                  type="button"
                  className="selector-ficha-quitar"
                  aria-label={`Quitar «${etiqueta}»`}
                  onClick={() => quitar(e)}
                >
                  <X size={12} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="selector-cuadro">
        <input
          ref={cuadro}
          id={id}
          type="text"
          role="combobox"
          className={`campo-control selector-entrada${!props.multiple && etiquetaElegida ? ' con-valor' : ''}`}
          aria-expanded={abierto}
          aria-controls={abierto ? idLista : undefined}
          aria-autocomplete="list"
          aria-activedescendant={abierto && filas.length > 0 ? `${idLista}-fila-${filaActiva}` : undefined}
          aria-describedby={idDeLaAyuda}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            props.multiple
              ? (marcador ?? 'Escriba para buscar…')
              : (etiquetaElegida || marcador || 'Escriba para buscar…')
          }
          value={abierto ? escrito : props.multiple ? '' : etiquetaElegida}
          onFocus={abrir}
          onClick={abrir}
          onChange={(e) => {
            if (!abierto) setAbierto(true)
            setEscrito(e.target.value)
            setActivo(0)
            setFormulario(null)
          }}
          onKeyDown={alPulsarTecla}
        />
        <button
          type="button"
          className="selector-flecha"
          tabIndex={-1}
          aria-label={abierto ? 'Cerrar la lista' : 'Abrir la lista'}
          onClick={() => (abierto ? cerrar() : (abrir(), cuadro.current?.focus()))}
        >
          <ChevronDown size={16} aria-hidden />
        </button>
      </div>

      {abierto ? (
        <div className="selector-desplegable">
          <ul id={idLista} role="listbox" aria-multiselectable={props.multiple ? true : undefined} className="selector-lista">
            {filas.map((fila, i) => {
              const idFila = `${idLista}-fila-${i}`
              const resaltada = i === filaActiva ? ' resaltada' : ''
              if (fila.tipo === 'ninguno') {
                return (
                  <li
                    key="ninguno"
                    id={idFila}
                    role="option"
                    aria-selected={!props.multiple && !props.valor}
                    className={`selector-opcion selector-opcion-ninguno${resaltada}`}
                    onMouseEnter={() => setActivo(i)}
                    onClick={() => {
                      if (!props.multiple) props.alCambiar(null)
                      cerrar()
                    }}
                  >
                    — ninguno —
                  </li>
                )
              }
              if (fila.tipo === 'agregar') {
                return (
                  <li
                    key="agregar"
                    id={idFila}
                    role="option"
                    aria-selected={false}
                    className={`selector-opcion selector-opcion-agregar${resaltada}`}
                    onMouseEnter={() => setActivo(i)}
                    onClick={alPulsarAgregar}
                  >
                    <Plus size={14} aria-hidden />
                    <span>
                      ¿No está? Agregar {catalogo?.articulo} {catalogo?.singular} <strong>«{escrito.trim()}»</strong>
                    </span>
                  </li>
                )
              }
              const marcada = elegidos.includes(fila.opcion.id)
              return (
                <li
                  key={fila.opcion.id}
                  id={idFila}
                  role="option"
                  aria-selected={marcada}
                  className={`selector-opcion${marcada ? ' marcada' : ''}${resaltada}`}
                  onMouseEnter={() => setActivo(i)}
                  onClick={() => elegir(fila.opcion)}
                >
                  <span className="selector-opcion-texto">{fila.opcion.etiqueta}</span>
                  {marcada ? <Check size={14} aria-hidden /> : null}
                </li>
              )
            })}
            {filas.length === 0 ? (
              <li className="selector-vacio" role="presentation">
                {todas.length === 0 ? 'Todavía no hay nada que elegir en ese catálogo.' : 'Nada coincide con lo escrito.'}
              </li>
            ) : null}
            {filtradas.length === 0 && !ofreceAgregar && escrito.trim() !== '' ? (
              <li className="selector-vacio" role="presentation">
                Nada coincide con «{escrito.trim()}».
              </li>
            ) : null}
          </ul>

          {formulario && catalogo ? (
            <form
              className="selector-agregar"
              onSubmit={(e) => {
                e.preventDefault()
                void agregar(formulario.nombre, formulario.codigo)
              }}
            >
              <p className="selector-agregar-titulo">Agregar {catalogo.conArticulo} al catálogo</p>
              <label className="selector-agregar-campo">
                <span>{catalogo.etiquetaDelNombre}</span>
                <input
                  className="campo-control"
                  value={formulario.nombre}
                  maxLength={120}
                  onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                />
              </label>
              {catalogo.extra ? (
                <label className="selector-agregar-campo">
                  <span>
                    {catalogo.extra.etiqueta}
                    {catalogo.extra.requerido ? ' *' : ' (opcional)'}
                  </span>
                  <input
                    className="campo-control"
                    value={formulario.codigo}
                    maxLength={catalogo.extra.maximo}
                    autoFocus
                    onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value })}
                  />
                  <small>{catalogo.extra.ayuda}</small>
                </label>
              ) : null}
              <div className="selector-agregar-acciones">
                <button
                  type="submit"
                  className="admin-btn admin-btn-primary"
                  disabled={
                    ocupado ||
                    paraComparar(formulario.nombre) === '' ||
                    (!!catalogo.extra?.requerido && paraComparar(formulario.codigo) === '')
                  }
                >
                  {ocupado ? 'Agregando…' : 'Agregar'}
                </button>
                <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setFormulario(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : null}
          {error ? (
            <p className="campo-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      {aviso ? (
        <p className="selector-aviso" role="status">
          {aviso}
        </p>
      ) : null}
    </div>
  )
}
