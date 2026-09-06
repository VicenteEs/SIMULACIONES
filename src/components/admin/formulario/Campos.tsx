'use client'

import { useId, useState, useTransition } from 'react'
import type { Campo } from '@/admin/esquema'
import { BLOQUES, bloqueDe } from '@/admin/bloques'
import { subirArchivo } from '@/app/(frontend)/acciones/contenido'
import { EditorTextoRico } from './EditorTextoRico'

/**
 * Los controles del formulario, uno por tipo de campo del esquema.
 *
 * Todo es controlado y sin estado propio salvo lo que es puramente visual
 * (un bloque plegado, una subida en curso). El documento entero vive en el
 * componente de la página, de modo que guardar es enviar ese objeto y no
 * recolectar el valor de treinta controles repartidos.
 */

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
}

const texto = (valor: unknown): string =>
  valor === null || valor === undefined ? '' : String(valor)

export function ControlDeCampo({ campo, valor, alCambiar, relaciones, alRecargarRelacion }: Props) {
  const id = useId()

  const etiqueta = (
    <label className="campo-etiqueta" htmlFor={id}>
      {campo.etiqueta}
      {campo.requerido ? <span className="campo-obligatorio" title="Obligatorio"> *</span> : null}
    </label>
  )
  const ayuda = campo.ayuda ? <p className="campo-ayuda">{campo.ayuda}</p> : null

  switch (campo.tipo) {
    case 'texto':
      return (
        <div className={`campo${campo.medio ? ' campo-medio' : ''}`}>
          {etiqueta}
          <input
            id={id}
            className="campo-control"
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
            rows={campo.filas ?? 3}
            value={texto(valor)}
            onChange={(e) => alCambiar(e.target.value)}
          />
          {ayuda}
        </div>
      )

    case 'numero':
      return (
        <div className={`campo${campo.medio ? ' campo-medio' : ''}`}>
          {etiqueta}
          <input
            id={id}
            type="number"
            className="campo-control"
            min={campo.min}
            max={campo.max}
            step={campo.paso ?? 'any'}
            value={valor === null || valor === undefined ? '' : String(valor)}
            onChange={(e) => alCambiar(e.target.value === '' ? null : Number(e.target.value))}
          />
          {ayuda}
        </div>
      )

    case 'seleccion':
      return (
        <div className={`campo${campo.medio ? ' campo-medio' : ''}`}>
          {etiqueta}
          <select
            id={id}
            className="campo-control"
            value={texto(valor)}
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
              checked={valor === true}
              onChange={(e) => alCambiar(e.target.checked)}
            />
            <span>{campo.etiqueta}</span>
          </label>
          {ayuda}
        </div>
      )

    case 'relacion':
      return (
        <div className={`campo${campo.medio ? ' campo-medio' : ''}`}>
          {etiqueta}
          <select
            id={id}
            className="campo-control"
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
        <div className="campo">
          {etiqueta}
          <EditorTextoRico valor={valor} alCambiar={alCambiar} />
          {ayuda}
        </div>
      )

    case 'grupo':
      return (
        <fieldset className="campo-grupo">
          <legend>{campo.etiqueta}</legend>
          {ayuda}
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

    case 'lista':
      return (
        <EditorDeLista
          campo={campo}
          valor={valor}
          alCambiar={alCambiar}
          relaciones={relaciones}
          alRecargarRelacion={alRecargarRelacion}
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
        />
      ))}
    </div>
  )
}

// -------------------------------------------------------------------- lista

function EditorDeLista({
  campo,
  valor,
  alCambiar,
  relaciones,
  alRecargarRelacion,
}: Props & { campo: Extract<Campo, { tipo: 'lista' }> }) {
  const filas = Array.isArray(valor) ? (valor as Record<string, unknown>[]) : []

  const cambiar = (nuevas: Record<string, unknown>[]) => alCambiar(nuevas)

  const mover = (indice: number, direccion: -1 | 1) => {
    const destino = indice + direccion
    if (destino < 0 || destino >= filas.length) return
    const copia = [...filas]
    ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
    cambiar(copia)
  }

  return (
    <div className="campo lista">
      <div className="lista-cabecera">
        <span className="campo-etiqueta">{campo.etiqueta}</span>
        <span className="lista-conteo">
          {filas.length} {filas.length === 1 ? campo.singular.toLowerCase() : 'en total'}
        </span>
      </div>
      {campo.ayuda ? <p className="campo-ayuda">{campo.ayuda}</p> : null}

      {filas.map((fila, i) => (
        <div className="lista-fila" key={(fila.id as string) ?? i}>
          <div className="lista-fila-barra">
            <span className="lista-fila-numero">
              {campo.singular} {i + 1}
            </span>
            <div className="lista-fila-acciones">
              <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} title="Subir">
                ↑
              </button>
              <button
                type="button"
                onClick={() => mover(i, 1)}
                disabled={i === filas.length - 1}
                title="Bajar"
              >
                ↓
              </button>
              <button
                type="button"
                className="lista-quitar"
                onClick={() => cambiar(filas.filter((_, j) => j !== i))}
                title={`Quitar ${campo.singular.toLowerCase()}`}
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

      <button type="button" className="admin-btn admin-btn-secondary" onClick={() => cambiar([...filas, {}])}>
        + Agregar {campo.singular.toLowerCase()}
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
  const [plegados, setPlegados] = useState<Record<number, boolean>>({})
  const [agregando, setAgregando] = useState(false)

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
        const plegado = plegados[i] === true
        return (
          <div className={`bloque-editor${plegado ? ' bloque-plegado' : ''}`} key={(bloque.id as string) ?? i}>
            <div className="bloque-barra">
              <button
                type="button"
                className="bloque-plegar"
                onClick={() => setPlegados({ ...plegados, [i]: !plegado })}
                title={plegado ? 'Desplegar' : 'Plegar'}
              >
                {plegado ? '▸' : '▾'}
              </button>
              <span className="bloque-tipo">{esquema.nombre}</span>
              <span className="bloque-resumen">{esquema.resumen(bloque)}</span>
              <div className="lista-fila-acciones">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} title="Subir">
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => mover(i, 1)}
                  disabled={i === bloques.length - 1}
                  title="Bajar"
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
                  title="Quitar bloque"
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
        <div className="bloques-menu">
          {BLOQUES.map((b) => (
            <button
              key={b.slug}
              type="button"
              className="bloques-menu-opcion"
              onClick={() => {
                cambiar([...bloques, { blockType: b.slug }])
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
          onClick={() => setAgregando(true)}
        >
          + Agregar bloque
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ archivo

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
  const [enCurso, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const actual = valor && typeof valor === 'object' ? (valor as { id?: unknown }).id : valor
  const seleccionado = opciones.find((o) => o.id === String(actual ?? ''))

  const subir = (archivo: File) => {
    setError(null)
    iniciar(async () => {
      const formulario = new FormData()
      formulario.set('coleccion', campo.coleccion)
      formulario.set('archivo', archivo)
      // La descripción se puede afinar después en la sección de medios; aquí
      // se pone el nombre del archivo para no bloquear la subida por un campo.
      formulario.set('alt', archivo.name.replace(/\.[^.]+$/, ''))
      formulario.set('nombre', archivo.name.replace(/\.[^.]+$/, ''))
      const resultado = await subirArchivo(formulario)
      if (resultado.exito && resultado.datos) {
        alCambiar(resultado.datos.id)
        alRecargar()
      } else {
        setError(resultado.mensaje ?? 'No se pudo subir el archivo.')
      }
    })
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
        <label className="admin-btn admin-btn-secondary archivo-subir">
          {enCurso ? 'Subiendo…' : 'Subir nuevo'}
          <input
            type="file"
            hidden
            disabled={enCurso}
            onChange={(e) => {
              const archivo = e.target.files?.[0]
              if (archivo) subir(archivo)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {error ? <p className="campo-error">{error}</p> : null}

      {seleccionado?.url ? (
        <div className="archivo-vista">
          {seleccionado.tipo?.startsWith('video/') ? (
            <video src={seleccionado.url} controls preload="metadata" />
          ) : (
            <img src={seleccionado.url} alt={seleccionado.etiqueta} />
          )}
        </div>
      ) : null}

      {campo.ayuda ? <p className="campo-ayuda">{campo.ayuda}</p> : null}
    </div>
  )
}
