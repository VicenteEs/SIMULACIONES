import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { auditorDeLaFicha } from '@/lib/revisionServidor'
import { fechaDeAuditoria, fechaDeEmision, literalDeCss } from '@/lib/impresion'
import { ruta } from '@/lib/rutas'
import { FechaDeEmision } from './FechaDeEmision'

/**
 * El membrete de la ficha impresa: el logotipo, quién emite el PDF y quién
 * auditó el contenido.
 *
 * En pantalla no existe (`display: none` en `estilos.css`) y en papel ocupa la
 * cabecera de la primera hoja. El mismo dato —emisor y auditor— se repite en el
 * pie de cada hoja con `@page`, para que una página suelta fotocopiada siga
 * diciendo de dónde viene y quién respondió por ella.
 *
 * Es de servidor porque el auditor sale de la colección `revisiones`, que el
 * navegador no puede leer: solo se imprime el nombre y el día, nada más de lo
 * que guarda.
 */
export async function EncabezadoImpreso({
  coleccion,
  documentoId,
  tipo,
  titulo,
}: {
  coleccion: string
  documentoId: string
  /** «Ficha de patología», «Caso de técnica AO»… lo que va sobre el logotipo. */
  tipo: string
  titulo: string
}) {
  const { usuario } = await obtenerSesion()
  const payload = await getPayload({ config })
  const revision = await auditorDeLaFicha(payload, coleccion, documentoId)

  const emisor =
    (typeof usuario?.nombre === 'string' && usuario.nombre.trim()) ||
    (typeof usuario?.email === 'string' && usuario.email) ||
    'Cuenta sin nombre'

  const dia = fechaDeAuditoria(revision?.fecha ?? null)
  const auditoria = !revision
    ? 'Sin auditoría registrada'
    : revision.auditor
      ? `${revision.auditor}${dia ? ` · ${dia}` : ''}`
      : dia
        ? `Auditada el ${dia}`
        : 'Auditoría pendiente'

  return (
    <aside className="membrete-impreso">
      {/* El pie de cada hoja. `@page` no se puede escribir en la hoja de
          estilos con datos de la petición, y el texto pasa por `literalDeCss`:
          dentro de `<style>` React no decodifica entidades. */}
      <style>{`@page { @bottom-left { content: ${literalDeCss(
        `${titulo} · Realizado por ${emisor} · ${revision?.auditor ? `Auditado por ${revision.auditor}` : auditoria}`,
      )}; } }`}</style>
      <div className="membrete-marca">
        <img src={ruta('/logo-hd.png')} alt="TraumaHub" className="membrete-logo" />
        <div className="membrete-documento">
          <span className="membrete-tipo">{tipo}</span>
          <span className="membrete-lema">Plataforma docente de traumatología</span>
        </div>
      </div>
      <dl className="membrete-datos">
        <div>
          <dt>Realizado por</dt>
          <dd>{emisor}</dd>
        </div>
        <div>
          <dt>Contenido auditado por</dt>
          <dd>{auditoria}</dd>
        </div>
        <div>
          <dt>Fecha de emisión</dt>
          <dd>
            <FechaDeEmision inicial={fechaDeEmision()} />
          </dd>
        </div>
      </dl>
    </aside>
  )
}
