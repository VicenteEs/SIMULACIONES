'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { archivoPorId, buscarArchivos, type ArchivoBuscado } from '@/app/(frontend)/acciones/contenido'

/**
 * El selector de un archivo de `medios`: se **escribe**, busca en el servidor y trae solo el que se elige.
 *
 * Sustituye al `<select>` que cargaba las primeras 500 filas de la biblioteca (`opcionesDeRelacion`). Con las 3.300
 * figuras que trajo la ingesta (D-144) quedaban más de 2.800 que no se podían elegir, y las 500 viajaban enteras en cada
 * ficha que se abría. Aquí no hay lista cargada de antemano: lo escrito va a `buscarArchivos` (por la descripción y por
 * el nombre del archivo, de veinte en veinte), y lo único que se descarga de una imagen es la elegida, en la vista previa
 * de quien lo usa. La lista no lleva miniaturas a propósito: serían veinte imágenes por cada letra.
 *
 * Es el patrón «combobox con lista» de ARIA 1.2, como `SelectorConBusqueda`: el foco no sale del cuadro, la opción marcada
 * se anuncia por `aria-activedescendant` y se mueve con las flechas, Intro elige y Escape cierra.
 *
 * Lo elegido se devuelve **con sus datos** (`id`, `alt`, `filename`, `url`, `mimeType`, que son los nombres con los que
 * Payload puebla un archivo) y no solo con el número. Así la vista previa, el botón «Descargar» y el filtro de bloques
 * tienen de dónde leer sin una segunda consulta, y `depurarDocumento` lo reduce al identificador al guardar, que es lo
 * mismo que ya hacía con un documento poblado. Un documento que llega con solo el número —una subida recién terminada—
 * se completa con `archivoPorId`.
 */

/** Cómo viaja un archivo elegido por el formulario: la forma de un documento poblado de Payload. */
export interface ArchivoElegido {
  id: string | number
  alt?: string
  filename?: string
  url?: string
  mimeType?: string
}

const SIN_RESULTADOS = { archivos: [] as ArchivoBuscado[], total: 0 }

/** Lo que se sabe del archivo que trae el valor, si el valor es un documento poblado y no un número. */
export function archivoDelValor(valor: unknown): ArchivoBuscado | null {
  if (!valor || typeof valor !== 'object') return null
  const doc = valor as ArchivoElegido
  if (doc.id === undefined || doc.id === null || typeof doc.url !== 'string') return null
  const nombre = doc.filename ?? ''
  return { id: String(doc.id), etiqueta: doc.alt || nombre || `#${doc.id}`, nombre, url: doc.url, tipo: doc.mimeType }
}

const comoElegido = (a: ArchivoBuscado): ArchivoElegido => ({
  id: a.id,
  alt: a.etiqueta,
  filename: a.nombre,
  url: a.url,
  mimeType: a.tipo,
})

/**
 * El archivo que dice el valor del campo, completado si hace falta.
 *
 * Vive fuera del cuadro de búsqueda porque lo necesitan dos: el cuadro, para rotular lo elegido, y el selector de archivo,
 * para la vista previa y el botón de descarga. Un valor poblado se lee tal cual; uno que trae solo el número —una subida
 * recién terminada— se pide a `archivoPorId`, una vez por número.
 */
export function useArchivoElegido(coleccion: string, valor: unknown) {
  // Los archivos que se completaron por su número, para no pedir dos veces el mismo.
  const [traidos, setTraidos] = useState<Record<string, ArchivoBuscado | null>>({})
  const idDelValor =
    valor && typeof valor === 'object' ? String((valor as { id?: unknown }).id ?? '') : String(valor ?? '')
  const elegido = archivoDelValor(valor) ?? (idDelValor ? (traidos[idDelValor] ?? null) : null)

  const faltaCompletar = idDelValor !== '' && !archivoDelValor(valor) && !(idDelValor in traidos)
  useEffect(() => {
    if (!faltaCompletar) return
    let vigente = true
    void archivoPorId(coleccion, idDelValor).then((r) => {
      if (vigente) setTraidos((previos) => ({ ...previos, [idDelValor]: r.exito ? (r.datos ?? null) : null }))
    })
    return () => {
      vigente = false
    }
  }, [faltaCompletar, coleccion, idDelValor])

  const recordar = (archivo: ArchivoBuscado) => setTraidos((previos) => ({ ...previos, [archivo.id]: archivo }))
  return { elegido, idDelValor, recordar }
}

export function BuscadorDeArchivos({
  id,
  idDeLaAyuda,
  coleccion,
  tipos,
  elegido,
  idDelValor,
  recordar,
  alCambiar,
  requerido,
}: {
  /** Para enlazar la etiqueta del campo con el cuadro. */
  id: string
  idDeLaAyuda?: string
  coleccion: string
  /** Prefijos de tipo MIME que se ofrecen (`image/`, `video/`); vacío es cualquiera. */
  tipos: string[]
  /** Lo que `useArchivoElegido` resolvió del valor del campo. */
  elegido: ArchivoBuscado | null
  idDelValor: string
  recordar: (archivo: ArchivoBuscado) => void
  alCambiar: (nuevo: ArchivoElegido | null) => void
  requerido?: boolean
}) {
  const idLista = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [escrito, setEscrito] = useState('')
  const [activo, setActivo] = useState(0)
  const [resultado, setResultado] = useState(SIN_RESULTADOS)
  const [buscando, setBuscando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  // La búsqueda, con una espera corta para no mandar una por tecla, y descartando la que llega tarde.
  const clave = tipos.join(',')
  useEffect(() => {
    if (!abierto) return
    let vigente = true
    const espera = window.setTimeout(
      () => {
        setBuscando(true)
        void buscarArchivos(coleccion, { busqueda: escrito, tipos: clave ? clave.split(',') : [] })
          .then((r) => {
            if (!vigente) return
            setBuscando(false)
            if (r.exito && r.datos) {
              setFallo(null)
              setResultado(r.datos)
              setActivo(0)
            } else {
              setFallo(r.mensaje ?? 'No se pudo buscar.')
            }
          })
          .catch(() => {
            if (!vigente) return
            setBuscando(false)
            setFallo('No se pudo buscar. Compruebe la conexión.')
          })
      },
      escrito === '' ? 0 : 250,
    )
    return () => {
      vigente = false
      window.clearTimeout(espera)
    }
  }, [abierto, escrito, coleccion, clave])

  // Pulsar fuera cierra la lista.
  useEffect(() => {
    if (!abierto) return
    const alPulsarFuera = (evento: PointerEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false)
    }
    document.addEventListener('pointerdown', alPulsarFuera)
    return () => document.removeEventListener('pointerdown', alPulsarFuera)
  }, [abierto])

  const elegir = (archivo: ArchivoBuscado) => {
    alCambiar(comoElegido(archivo))
    recordar(archivo)
    setAbierto(false)
    setEscrito('')
  }

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { archivos } = resultado
    if (e.key === 'Escape') {
      if (abierto) {
        e.stopPropagation()
        setAbierto(false)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!abierto) setAbierto(true)
      else setActivo((a) => Math.min(archivos.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && abierto) {
      // Intro dentro de un formulario lo envía; aquí solo elige.
      e.preventDefault()
      const archivo = archivos[activo]
      if (archivo) elegir(archivo)
    }
  }

  const { archivos, total } = resultado

  return (
    <div className="selector-busqueda" ref={contenedor}>
      {elegido ? (
        <p className="archivo-elegido">
          <strong>{elegido.etiqueta}</strong>
          {elegido.nombre && elegido.nombre !== elegido.etiqueta ? (
            <span className="archivo-elegido-nombre">{elegido.nombre}</span>
          ) : null}
          {!requerido ? (
            <button type="button" className="lista-boton-texto" onClick={() => alCambiar(null)}>
              Quitar
            </button>
          ) : null}
        </p>
      ) : idDelValor ? (
        <p className="campo-ayuda">Cargando el archivo elegido…</p>
      ) : null}

      <div className="selector-cuadro">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={abierto && archivos[activo] ? `${idLista}-${activo}` : undefined}
          aria-describedby={idDeLaAyuda}
          // Qué número hay elegido, para quien inspecciona el campo (y las pruebas, que no ven el servidor).
          data-valor={idDelValor}
          className="campo-control selector-entrada"
          autoComplete="off"
          placeholder={elegido ? 'Buscar otro archivo…' : 'Escriba para buscar por descripción o nombre…'}
          value={escrito}
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            setEscrito(e.target.value)
            setAbierto(true)
          }}
          onKeyDown={alTeclear}
        />
        <button
          type="button"
          className="selector-flecha"
          tabIndex={-1}
          aria-label={abierto ? 'Cerrar la lista de archivos' : 'Abrir la lista de archivos'}
          onClick={() => setAbierto((a) => !a)}
        >
          {abierto ? <Search size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
      </div>

      {abierto ? (
        <div className="selector-desplegable">
          <ul id={idLista} role="listbox" className="selector-lista" aria-label="Archivos que coinciden">
            {archivos.map((archivo, i) => (
              <li
                key={archivo.id}
                id={`${idLista}-${i}`}
                role="option"
                aria-selected={archivo.id === idDelValor}
                className={`selector-opcion${archivo.id === idDelValor ? ' marcada' : ''}${i === activo ? ' resaltada' : ''}`}
                // `onMouseDown` y no `onClick`: el clic le quitaría el foco al cuadro antes de elegir.
                onMouseDown={(e) => {
                  e.preventDefault()
                  elegir(archivo)
                }}
                onMouseEnter={() => setActivo(i)}
              >
                <span className="selector-opcion-texto">{archivo.etiqueta}</span>
                {archivo.nombre && archivo.nombre !== archivo.etiqueta ? (
                  <span className="archivo-elegido-nombre">{archivo.nombre}</span>
                ) : null}
              </li>
            ))}
            {archivos.length === 0 && !buscando && !fallo ? (
              <li className="selector-vacio" role="presentation">
                {escrito.trim() ? 'Ningún archivo coincide con lo escrito.' : 'Todavía no hay archivos subidos.'}
              </li>
            ) : null}
            {buscando ? (
              <li className="selector-vacio" role="presentation">
                Buscando…
              </li>
            ) : null}
          </ul>
          {fallo ? (
            <p className="campo-error" role="alert">
              {fallo}
            </p>
          ) : null}
          {total > archivos.length ? (
            <p className="selector-aviso" role="status">
              {`Se muestran ${archivos.length} de ${total}. Escriba más para acotar.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
