'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { CloudOff, History, Users, Copy } from 'lucide-react'
import { haceCuanto, horaDe } from '@/lib/guardadoAutomatico'
import { iniciales, type OtroEditor } from '@/lib/presencia'

/**
 * Las bandas del editor que no son del formulario sino de lo que pasa
 * alrededor: otra persona con la ficha abierta, una copia sin guardar de una
 * visita anterior, la conexión que se fue.
 *
 * Van aparte de `FormularioDocumento.tsx` porque ese archivo ya es largo y
 * porque estas piezas no tocan el documento: reciben lo que tienen que decir
 * y devuelven, como mucho, un clic.
 */

// ------------------------------------------------------------------ reloj

/**
 * Un reloj que solo repinta a quien lo usa.
 *
 * «Guardado hace 12 s» y «desde hace 3 min» tienen que moverse solos, y si el
 * tic viviera en el formulario repintaría cada pocos segundos el editor
 * entero, con sus textos ricos: es el mismo precio que
 * `useSeguimientoDeRevision` se niega a pagar por medir.
 */
function useAhora(cadaMs: number): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const reloj = window.setInterval(() => setAhora(Date.now()), cadaMs)
    return () => window.clearInterval(reloj)
  }, [cadaMs])
  return ahora
}

/** «hace 12 s», moviéndose solo. `desfase` corrige un reloj ajeno (el del servidor). */
export function Hace({ desde, desfase = 0 }: { desde: number; desfase?: number }) {
  const ahora = useAhora(5_000)
  return <>{haceCuanto(desde, ahora + desfase)}</>
}

// ------------------------------------------------------------------ conexión

const suscribirConexion = (avisar: () => void) => {
  window.addEventListener('online', avisar)
  window.addEventListener('offline', avisar)
  return () => {
    window.removeEventListener('online', avisar)
    window.removeEventListener('offline', avisar)
  }
}

/**
 * Lo que dice el navegador de la red.
 *
 * Solo vale en un sentido: `false` es seguro que no hay red, pero `true` no
 * asegura que el servidor conteste —el wifi conectado con el túnel caído—.
 * Por eso el formulario lo junta con lo que le pasó al último guardado
 * (`pareceCorteDeRed`). En el servidor se da por conectado, para que el
 * primer pintado no salga con la banda puesta.
 */
export function useEnLinea(): boolean {
  return useSyncExternalStore(
    suscribirConexion,
    () => navigator.onLine,
    () => true,
  )
}

export function BandaSinConexion({ copiaLocal }: { copiaLocal: number | null }) {
  return (
    // Sin región viva aquí: aparece junto con su texto y no se anunciaría. Lo
    // anuncia la región que el formulario tiene siempre montada.
    <div className="editor-banda editor-banda-atencion">
      <CloudOff aria-hidden size={18} className="editor-banda-icono" />
      <div className="editor-banda-texto">
        <strong>Sin conexión: lo que escribe se guarda en este navegador.</strong>
        <span>
          Guarde cuando vuelva la conexión.
          {copiaLocal ? ` Última copia local a las ${horaDe(copiaLocal)}.` : ''}
        </span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ copia local

export function BandaDeRecuperacion({
  guardadaEn,
  otraVersion,
  alRecuperar,
  alDescartar,
}: {
  guardadaEn: number
  otraVersion: boolean
  alRecuperar: () => void
  alDescartar: () => void
}) {
  return (
    <div className="editor-banda editor-banda-info" role="region" aria-label="Cambios sin guardar de otra visita">
      <History aria-hidden size={18} className="editor-banda-icono" />
      <div className="editor-banda-texto">
        <strong>
          Hay cambios de esta ficha que no llegaron a guardarse (en este navegador, a las {horaDe(guardadaEn)}).
        </strong>
        {otraVersion ? (
          <span>
            Ojo: la ficha se guardó después de esa copia, quizá por otra persona. Si los recupera y guarda,
            verá el aviso de choque y podrá comparar antes de reemplazar nada.
          </span>
        ) : (
          <span>Recuperarlos los pone en el formulario como cambios sin guardar; no se guarda nada solo.</span>
        )}
      </div>
      <div className="editor-banda-acciones">
        <button type="button" className="admin-btn admin-btn-primary admin-btn-sm" onClick={alRecuperar}>
          Recuperarlos
        </button>
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={alDescartar}>
          Descartar
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ presencia

const ROL_EN_PALABRAS: Record<string, string> = { admin: 'administración', editor: 'edición' }

/** «Elena Editora», «Elena Editora y Esteban Editor», «Elena, Esteban y Ana». */
export function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

export function BandaDePresencia({
  otros,
  misOtrasPestanas,
  desfase,
}: {
  otros: OtroEditor[]
  misOtrasPestanas: number
  desfase: number
}) {
  if (otros.length === 0 && misOtrasPestanas === 0) return null
  return (
    // Tampoco es región viva: «desde hace 3 min» cambia cada pocos segundos y
    // el lector lo leería entero cada vez. Quién entra y quién sale lo anuncia
    // la región siempre montada del formulario, con una frase sin reloj.
    <div className="editor-banda editor-banda-presencia">
      {otros.length > 0 ? (
        <>
          <span className="editor-avatares" aria-hidden>
            {otros.slice(0, 3).map((o) => (
              <span key={`${o.nombre}-${o.desde}`} className="editor-avatar">
                {iniciales(o.nombre)}
              </span>
            ))}
          </span>
          <div className="editor-banda-texto">
            <strong>
              {enumerar(otros.map((o) => o.nombre))} también {otros.length === 1 ? 'tiene' : 'tienen'} abierta
              esta ficha
              {otros.length === 1 ? (
                <>
                  {' '}
                  (desde <Hace desde={otros[0].desde} desfase={desfase} />
                  {otros[0].segundoPlano ? ', en una pestaña en segundo plano' : ''})
                </>
              ) : null}
              .
            </strong>
            <span>
              Si {otros.length === 1 ? 'los dos guardan' : 'varios guardan'}, el segundo verá el aviso de choque.
              Conviene ponerse de acuerdo antes de escribir.
            </span>
          </div>
        </>
      ) : null}
      {misOtrasPestanas > 0 ? (
        <div className="editor-banda-texto editor-banda-propia">
          <span>
            <Copy aria-hidden size={14} /> Usted tiene esta ficha abierta en otra pestaña
            {misOtrasPestanas > 1 ? ` (${misOtrasPestanas})` : ''}. Si guarda en las dos, la segunda verá el
            aviso de choque.
          </span>
        </div>
      ) : null}
    </div>
  )
}

/** Los círculos con iniciales de la barra fija: lo mismo que la banda, en pequeño. */
export function IndicadorDePresencia({ otros, misOtrasPestanas }: { otros: OtroEditor[]; misOtrasPestanas: number }) {
  if (otros.length === 0 && misOtrasPestanas === 0) return null
  const frase =
    otros.length > 0
      ? `${enumerar(otros.map((o) => `${o.nombre} (${ROL_EN_PALABRAS[o.rol] ?? o.rol})`))} también ${
          otros.length === 1 ? 'tiene' : 'tienen'
        } abierta esta ficha`
      : 'Usted tiene esta ficha abierta en otra pestaña'
  return (
    <span className="editor-presencia" title={frase} role="img" aria-label={frase}>
      {otros.length > 0 ? (
        otros.slice(0, 3).map((o) => (
          <span key={`${o.nombre}-${o.desde}`} className="editor-avatar editor-avatar-sm">
            {iniciales(o.nombre)}
          </span>
        ))
      ) : (
        <Users aria-hidden size={16} />
      )}
      {otros.length > 3 ? <span className="editor-avatar editor-avatar-sm">+{otros.length - 3}</span> : null}
    </span>
  )
}
