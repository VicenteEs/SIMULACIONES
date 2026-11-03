'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, ImageIcon, SearchX, Type } from 'lucide-react'
import { apuntarCambiosSinGuardar } from '@/admin/salidaDelEditor'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { Pestanas } from '@/components/ui/Pestanas'
import { Vacio } from '@/components/ui/Vacio'
import {
  ESPACIOS_DE_FOTO,
  ESPACIOS_DE_TEXTO,
  PAGINAS_PUBLICAS,
  type EspacioDeFoto,
  type EspacioDeTexto,
} from '@/lib/espaciosDeLaPagina'
import type { FotoSubida, TextoCambiado } from '@/lib/mediosDeLaPagina'
import { ruta } from '@/lib/rutas'
import { SeccionDeTextos } from './SeccionDeTextos'
import { TarjetaDeFoto } from './TarjetaDeFoto'

/** Lo cambiado, como lo manda la página de servidor: objetos y no `Map`, que no cruzan al cliente. */
export interface CambiosParaElPanel {
  fotos: Record<string, FotoSubida>
  textos: Record<string, TextoCambiado>
}

interface GrupoDeTextos {
  clave: string
  pagina: string
  seccion: string
  espacios: EspacioDeTexto[]
}

/**
 * Los textos agrupados por página y sección, en el orden del registro, que es
 * el orden en que se leen en la página. Se calcula una vez, fuera del
 * componente: cada grupo tiene que ser el mismo objeto en cada pintada, porque
 * `SeccionDeTextos` decide por identidad si lo guardado cambió.
 */
const GRUPOS_DE_TEXTOS: GrupoDeTextos[] = (() => {
  const grupos = new Map<string, GrupoDeTextos>()
  for (const espacio of ESPACIOS_DE_TEXTO) {
    const clave = `${espacio.pagina}:${espacio.seccion}`
    const grupo = grupos.get(clave) ?? { clave, pagina: espacio.pagina, seccion: espacio.seccion, espacios: [] }
    grupo.espacios.push(espacio)
    grupos.set(clave, grupo)
  }
  return [...grupos.values()]
})()

const GRUPOS_DE_FOTOS: { seccion: string; espacios: EspacioDeFoto[] }[] = (() => {
  const grupos = new Map<string, EspacioDeFoto[]>()
  for (const espacio of ESPACIOS_DE_FOTO) grupos.set(espacio.seccion, [...(grupos.get(espacio.seccion) ?? []), espacio])
  return [...grupos].map(([seccion, espacios]) => ({ seccion, espacios }))
})()

const nombreDePagina = (id: string) => PAGINAS_PUBLICAS.find((p) => p.id === id)?.nombre ?? id

/** Para buscar sin que importen las tildes ni las mayúsculas: «tecnica» encuentra «Técnica AO». */
const plano = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/**
 * La pestaña «Medios de la página» (P-007 E2): dos vistas, Fotos y Textos, con
 * un buscador y un filtro de «solo lo cambiado».
 *
 * Lo que no está guardado se cuenta aquí, sumando lo que dice cada tarjeta y
 * cada sección, y mientras haya algo la barra lateral, Atrás y cerrar la
 * pestaña preguntan antes de salir (`apuntarCambiosSinGuardar`). Cambiar de
 * vista no pierde nada (ver el comentario de las dos vistas, abajo).
 */
export function PanelDeMediosDeLaPagina({ cambios }: { cambios: CambiosParaElPanel }) {
  const [vista, setVista] = useState<'fotos' | 'textos'>('fotos')
  const [busqueda, setBusqueda] = useState('')
  const [soloCambiados, setSoloCambiados] = useState(false)
  const [sucias, setSucias] = useState<ReadonlySet<string>>(() => new Set())

  const alSuciar = useCallback((clave: string, sucia: boolean) => {
    setSucias((antes) => {
      if (antes.has(clave) === sucia) return antes
      const despues = new Set(antes)
      if (sucia) despues.add(clave)
      else despues.delete(clave)
      return despues
    })
  }, [])

  useEffect(() => {
    if (sucias.size === 0) return
    return apuntarCambiosSinGuardar()
  }, [sucias.size])

  // Por sección y estable entre pintadas mientras no lleguen cambios nuevos del
  // servidor: ver `GRUPOS_DE_TEXTOS`.
  const actualesPorSeccion = useMemo(() => {
    const porSeccion: Record<string, Record<string, string>> = {}
    for (const grupo of GRUPOS_DE_TEXTOS) {
      porSeccion[grupo.clave] = Object.fromEntries(
        grupo.espacios.filter((e) => cambios.textos[e.id]).map((e) => [e.id, cambios.textos[e.id].texto]),
      )
    }
    return porSeccion
  }, [cambios.textos])

  const consulta = plano(busqueda.trim())

  const fotosVisibles = GRUPOS_DE_FOTOS.map((g) => ({
    ...g,
    espacios: g.espacios.filter(
      (e) =>
        (!soloCambiados || cambios.fotos[e.id]) &&
        (!consulta || plano(`${e.seccion} ${e.nombre} ${e.descripcion}`).includes(consulta)),
    ),
  })).filter((g) => g.espacios.length > 0)

  // En los textos se filtra la sección entera, no los campos: una sección con
  // la mitad de sus campos escondidos se guardaría igual entera, y lo oculto no
  // se vería cambiar.
  const textosVisibles = GRUPOS_DE_TEXTOS.filter((g) => {
    const enEsta = g.espacios.filter((e) => !soloCambiados || cambios.textos[e.id])
    if (enEsta.length === 0) return false
    if (!consulta) return true
    return plano(`${nombreDePagina(g.pagina)} ${g.seccion}`).includes(consulta) ||
      enEsta.some((e) => plano(`${e.nombre} ${cambios.textos[e.id]?.texto ?? e.original}`).includes(consulta))
  })

  const fotosCambiadas = Object.keys(cambios.fotos).length
  const textosCambiados = Object.keys(cambios.textos).length

  return (
    <div className="mp">
      <CabeceraDePagina
        titulo="Medios de la página"
        subtitulo="Las fotos y los textos de la portada y de la página de planes. Lo que se guarde aquí lo ve al momento cualquier visitante."
        acciones={
          <div className="admin-acciones">
            {PAGINAS_PUBLICAS.map((p) => (
              <a
                key={p.id}
                className="admin-btn admin-btn-secondary admin-btn-sm"
                href={ruta(`/vista-previa?pagina=${p.id}`)}
                target="_blank"
                rel="noopener"
              >
                <ExternalLink size={15} aria-hidden /> Ver {p.nombre.toLowerCase()} como visitante
              </a>
            ))}
          </div>
        }
      />

      <div className="admin-filters mp-filtros">
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="mp-buscar">
            Buscar
          </label>
          <input
            id="mp-buscar"
            type="search"
            className="admin-input"
            placeholder={vista === 'fotos' ? 'Una sección o una foto' : 'Una sección, un campo o una frase'}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <label className="mp-casilla">
          <input type="checkbox" checked={soloCambiados} onChange={(e) => setSoloCambiados(e.target.checked)} />
          Solo lo cambiado
        </label>
        {sucias.size > 0 ? (
          <span className="insignia insignia-atencion" role="status">
            Hay cambios sin guardar
          </span>
        ) : null}
      </div>

      <Pestanas
        base="mp"
        etiqueta="Qué cambiar"
        activa={vista}
        alCambiar={(id) => setVista(id as 'fotos' | 'textos')}
        pestanas={[
          {
            id: 'fotos',
            etiqueta: (
              <>
                <ImageIcon size={15} aria-hidden /> Fotos · {fotosCambiadas} de {ESPACIOS_DE_FOTO.length} cambiadas
              </>
            ),
          },
          {
            id: 'textos',
            etiqueta: (
              <>
                <Type size={15} aria-hidden /> Textos · {textosCambiados} de {ESPACIOS_DE_TEXTO.length} cambiados
              </>
            ),
          },
        ]}
      />

      {/* Las dos vistas se quedan montadas aunque no se vean, y no con
          `PanelDePestana`, que desmonta la que no está activa: lo elegido y no
          guardado —una foto en vista previa, un texto a medio escribir— vive en
          el estado de cada tarjeta y de cada sección, y mirar la otra vista lo
          borraba sin preguntar. Los `id` son los que espera `Pestanas`. */}
      <div role="tabpanel" id="mp-panel-fotos" aria-labelledby="mp-pestana-fotos" className="pestana-panel" hidden={vista !== 'fotos'}>
        {fotosVisibles.length === 0 ? (
          <Vacio icono={SearchX} titulo={soloCambiados ? 'Ninguna foto cambiada' : 'Ninguna foto coincide con la búsqueda'}>
            {soloCambiados ? 'Todas las fotos son las originales del atlas.' : 'Pruebe con el nombre de una sección: «Opera», «Interpreta».'}
          </Vacio>
        ) : (
          fotosVisibles.map((grupo) => (
            <section key={grupo.seccion} className="mp-grupo" aria-label={grupo.seccion}>
              <h2 className="mp-grupo-titulo">{grupo.seccion}</h2>
              <div className="mp-rejilla">
                {grupo.espacios.map((espacio) => (
                  <TarjetaDeFoto
                    key={espacio.id}
                    espacio={espacio}
                    vigente={cambios.fotos[espacio.id] ?? null}
                    alSuciar={alSuciar}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <div role="tabpanel" id="mp-panel-textos" aria-labelledby="mp-pestana-textos" className="pestana-panel" hidden={vista !== 'textos'}>
          {textosVisibles.length === 0 ? (
            <Vacio icono={SearchX} titulo={soloCambiados ? 'Ningún texto cambiado' : 'Ningún texto coincide con la búsqueda'}>
              {soloCambiados ? 'Todos los textos son los originales.' : 'Pruebe con una palabra del texto o el nombre de la sección.'}
            </Vacio>
          ) : null}
          {GRUPOS_DE_TEXTOS.map((grupo) => (
            <div key={grupo.clave} hidden={!textosVisibles.includes(grupo)}>
              <SeccionDeTextos
                clave={grupo.clave}
                titulo={`${nombreDePagina(grupo.pagina)} · ${grupo.seccion}`}
                espacios={grupo.espacios}
                actuales={actualesPorSeccion[grupo.clave]}
                alSuciar={alSuciar}
              />
            </div>
          ))}
      </div>
    </div>
  )
}
