'use client'

import React, { useRef, useState } from 'react'
import Link from 'next/link'
import { Building2, Check, CircleCheck, Loader2, Mail, Send, Users } from 'lucide-react'
import { pedirCotizacion } from '@/app/(frontend)/acciones/cotizar'
import { MESES_DE_LAS_COTIZACIONES, plazoEnPalabras } from '@/lib/conservacion'
import {
  LARGOS_DE_COTIZACION,
  MODULOS_COTIZABLES,
  NOMBRE_CORTO_DE_MODULO,
  TRAMOS_DE_RESIDENTES,
  problemasDeLaCotizacion,
  type DatosDeCotizacion,
  type ProblemasDeCotizacion,
} from '@/lib/cotizaciones'

const VACIO: DatosDeCotizacion = { nombre: '', correo: '', institucion: '', cargo: '', residentes: '', modulos: [], mensaje: '' }

/** El orden de los campos en pantalla, para llevar el foco al primero que falla. */
const ORDEN: (keyof DatosDeCotizacion)[] = ['nombre', 'correo', 'institucion', 'cargo', 'residentes', 'modulos', 'mensaje']

export interface TextosDelFormulario {
  titulo: string
  boton: string
  nota: string
  enviadaTitular: string
  enviadaBajada: string
}

/**
 * El formulario de «Cotizar» (P-007 E3).
 *
 * Avisa campo a campo con la misma regla que aplica la acción
 * (`problemasDeLaCotizacion`), pero solo después del primer intento de enviar
 * o al salir de un campo ya tocado: un formulario que se pone en rojo mientras
 * se escribe el primer carácter regaña antes de que haya nada que corregir.
 *
 * Tres estados además del normal: enviando (el botón no se pulsa dos veces),
 * enviada (la pantalla «Cotización enviada» de Penpot, en el mismo sitio) y
 * error (un aviso sobre el botón, con lo escrito intacto: perder seis campos
 * por un corte de red es la forma más segura de que no se vuelva a intentar).
 *
 * El campo `sitioWeb` es la trampa de siempre (`solicitarCuenta`): no se ve, y
 * quien lo rellena es un robot.
 */
export function FormularioDeCotizacion({
  textos,
  modulosVisibles,
}: {
  textos: TextosDelFormulario
  /** Los módulos que no están en mantención: no se ofrece cotizar uno que no se puede ver. */
  modulosVisibles: readonly string[]
}) {
  const [datos, setDatos] = useState<DatosDeCotizacion>(VACIO)
  const [tocados, setTocados] = useState<ReadonlySet<keyof DatosDeCotizacion>>(new Set())
  const [intentado, setIntentado] = useState(false)
  const [estado, setEstado] = useState<'editando' | 'enviando' | 'enviada'>('editando')
  const [error, setError] = useState<string | null>(null)
  const formulario = useRef<HTMLFormElement>(null)
  const trampa = useRef<HTMLInputElement>(null)

  const problemas: ProblemasDeCotizacion = problemasDeLaCotizacion(datos)
  const aviso = (campo: keyof DatosDeCotizacion) => (intentado || tocados.has(campo) ? problemas[campo] : undefined)

  const cambiar = <K extends keyof DatosDeCotizacion>(campo: K, valor: DatosDeCotizacion[K]) => {
    setDatos((antes) => ({ ...antes, [campo]: valor }))
    setError(null)
  }
  const tocar = (campo: keyof DatosDeCotizacion) =>
    setTocados((antes) => (antes.has(campo) ? antes : new Set(antes).add(campo)))

  const alternarModulo = (slug: string) =>
    cambiar('modulos', datos.modulos.includes(slug) ? datos.modulos.filter((m) => m !== slug) : [...datos.modulos, slug])

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setIntentado(true)
    const primero = ORDEN.find((campo) => problemas[campo])
    if (primero) {
      formulario.current?.querySelector<HTMLElement>(`[data-campo="${primero}"]`)?.focus()
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('Parece que no hay conexión. Revisa tu red y vuelve a intentarlo: lo escrito sigue aquí.')
      return
    }
    setEstado('enviando')
    setError(null)
    try {
      const respuesta = await pedirCotizacion({ ...datos, sitioWeb: trampa.current?.value ?? '' })
      if (respuesta.exito) {
        setEstado('enviada')
        return
      }
      setError(respuesta.mensaje ?? 'No se pudo enviar la solicitud. Vuelve a intentarlo en unos minutos.')
    } catch {
      setError('No se pudo enviar la solicitud: se cortó la conexión. Lo escrito sigue aquí; vuelve a intentarlo.')
    }
    setEstado('editando')
  }

  if (estado === 'enviada') {
    return (
      <div className="p-formulario p-formulario-enviada" role="status">
        <span className="p-enviada-icono" aria-hidden="true">
          <CircleCheck size={40} />
        </span>
        <h3>{textos.enviadaTitular}</h3>
        <p>{textos.enviadaBajada}</p>
        <p className="p-enviada-correo">
          Escribiremos a <strong>{datos.correo.trim()}</strong>.
        </p>
        <button
          type="button"
          className="p-boton p-boton-contorno-claro"
          onClick={() => {
            setDatos(VACIO)
            setTocados(new Set())
            setIntentado(false)
            setEstado('editando')
          }}
        >
          Enviar otra solicitud
        </button>
      </div>
    )
  }

  const enviando = estado === 'enviando'
  const campo = (nombre: keyof DatosDeCotizacion) => ({
    id: `cotizar-${nombre}`,
    'data-campo': nombre,
    'aria-invalid': aviso(nombre) ? true : undefined,
    'aria-describedby': aviso(nombre) ? `cotizar-${nombre}-aviso` : undefined,
    onBlur: () => tocar(nombre),
    disabled: enviando,
  })
  const avisoDe = (de: keyof DatosDeCotizacion) =>
    aviso(de) ? (
      <p id={`cotizar-${de}-aviso`} className="p-campo-aviso">
        {aviso(de)}
      </p>
    ) : null

  return (
    <form ref={formulario} className="p-formulario" onSubmit={enviar} noValidate aria-labelledby="cotizar-titulo">
      <h3 id="cotizar-titulo">{textos.titulo}</h3>

      <div className="p-campos">
        <div className="p-campo">
          <label htmlFor="cotizar-nombre">Nombre completo</label>
          <input
            {...campo('nombre')}
            type="text"
            autoComplete="name"
            placeholder="Tu nombre"
            maxLength={LARGOS_DE_COTIZACION.nombre}
            value={datos.nombre}
            onChange={(e) => cambiar('nombre', e.target.value)}
            required
          />
          {avisoDe('nombre')}
        </div>
        <div className="p-campo">
          <label htmlFor="cotizar-correo">Correo institucional</label>
          <span className="p-campo-con-icono">
            <Mail size={17} aria-hidden />
            <input
              {...campo('correo')}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="nombre@hospital.cl"
              maxLength={LARGOS_DE_COTIZACION.correo}
              value={datos.correo}
              onChange={(e) => cambiar('correo', e.target.value)}
              required
            />
          </span>
          {avisoDe('correo')}
        </div>
        <div className="p-campo p-campo-ancho">
          <label htmlFor="cotizar-institucion">Institución o servicio</label>
          <span className="p-campo-con-icono">
            <Building2 size={17} aria-hidden />
            <input
              {...campo('institucion')}
              type="text"
              autoComplete="organization"
              placeholder="Hospital, universidad o servicio de traumatología"
              maxLength={LARGOS_DE_COTIZACION.institucion}
              value={datos.institucion}
              onChange={(e) => cambiar('institucion', e.target.value)}
              required
            />
          </span>
          {avisoDe('institucion')}
        </div>
        <div className="p-campo">
          <label htmlFor="cotizar-cargo">
            Tu cargo <span className="p-opcional">(opcional)</span>
          </label>
          <input
            {...campo('cargo')}
            type="text"
            autoComplete="organization-title"
            placeholder="Residente, docente, jefatura…"
            maxLength={LARGOS_DE_COTIZACION.cargo}
            value={datos.cargo}
            onChange={(e) => cambiar('cargo', e.target.value)}
          />
          {avisoDe('cargo')}
        </div>
        <div className="p-campo">
          <label htmlFor="cotizar-residentes">Residentes a incorporar</label>
          <span className="p-campo-con-icono">
            <Users size={17} aria-hidden />
            <select
              {...campo('residentes')}
              value={datos.residentes}
              onChange={(e) => {
                cambiar('residentes', e.target.value)
                tocar('residentes')
              }}
              required
            >
              <option value="" disabled>
                Selecciona
              </option>
              {TRAMOS_DE_RESIDENTES.map((tramo) => (
                <option key={tramo} value={tramo}>
                  {tramo}
                </option>
              ))}
            </select>
          </span>
          {avisoDe('residentes')}
        </div>

        <fieldset className="p-campo p-campo-ancho" disabled={enviando}>
          <legend>
            Módulos de interés <span className="p-opcional">(opcional)</span>
          </legend>
          <div className="p-fichas">
            {MODULOS_COTIZABLES.filter((m) => modulosVisibles.includes(m.slug)).map((m, i) => {
              const marcado = datos.modulos.includes(m.slug)
              return (
                <button
                  key={m.slug}
                  type="button"
                  className="p-ficha"
                  data-tono={MODULOS_COTIZABLES.findIndex((x) => x.slug === m.slug) + 1}
                  aria-pressed={marcado}
                  data-campo={i === 0 ? 'modulos' : undefined}
                  onClick={() => alternarModulo(m.slug)}
                  title={m.nombre}
                >
                  {marcado ? <Check size={15} aria-hidden /> : null}
                  <span className="p-ficha-numero" aria-hidden="true">
                    {m.numero}
                  </span>
                  {NOMBRE_CORTO_DE_MODULO[m.slug] ?? m.nombre}
                </button>
              )
            })}
          </div>
          {avisoDe('modulos')}
        </fieldset>

        <div className="p-campo p-campo-ancho">
          <label htmlFor="cotizar-mensaje">
            Cuéntanos más <span className="p-opcional">(opcional)</span>
          </label>
          <textarea
            {...campo('mensaje')}
            rows={3}
            placeholder="Por ejemplo: cuántos residentes tienen, desde cuándo quieren empezar…"
            maxLength={LARGOS_DE_COTIZACION.mensaje}
            value={datos.mensaje}
            onChange={(e) => cambiar('mensaje', e.target.value)}
          />
          {avisoDe('mensaje')}
        </div>
      </div>

      {/* La trampa: fuera de la vista y del tabulador, y sin autocompletar,
          que si no el navegador la rellena con la web de la persona. Rotulada
          como lo que un robot quiere rellenar, igual que en el registro: un
          «No rellenar» le avisaba de que era la trampa. */}
      <div className="p-trampa" aria-hidden="true">
        <label htmlFor="cotizar-sitio">Sitio web</label>
        <input ref={trampa} id="cotizar-sitio" name="sitioWeb" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      {error ? (
        <p className="p-formulario-error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="p-boton p-boton-marca p-boton-lg p-boton-bloque" disabled={enviando} aria-busy={enviando}>
        {enviando ? (
          <>
            <Loader2 size={18} className="p-girando" aria-hidden /> Enviando…
          </>
        ) : (
          <>
            {textos.boton} <Send size={18} aria-hidden />
          </>
        )}
      </button>
      {textos.nota ? <p className="p-formulario-nota">{textos.nota}</p> : null}
      {/* Fija y no entre los textos que se editan desde el panel: la ley pide
          que quien entrega sus datos tenga el aviso a la vista, y un texto
          editable se puede borrar sin querer. En otra pestaña, como desde el
          registro, para no perder lo escrito; `/privacidad` le dice a quien
          llega así que puede cerrarla. */}
      <p className="p-formulario-nota">
        Usamos estos datos solo para responderte, y la cotización se borra a los{' '}
        {plazoEnPalabras(MESES_DE_LAS_COTIZACIONES)}. Más en el{' '}
        <Link href="/privacidad" target="_blank" rel="noopener">
          aviso de privacidad
        </Link>
        .
      </p>
    </form>
  )
}
