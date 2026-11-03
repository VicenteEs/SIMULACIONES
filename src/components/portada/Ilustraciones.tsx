import { MapPin, Play, ShieldCheck } from 'lucide-react'
import { ImagenConCarga } from '@/components/ui/ImagenConCarga'
import type { FotoParaPintar } from './fotos'

/**
 * Las ilustraciones de los capítulos Examina, Técnica AO, Opera e Interpreta
 * (la de Estudia es interactiva y vive en `CapasDelCuerpo`).
 *
 * Cada una es una foto de «Medios de la página» con su marco y unos rótulos
 * encima. Los rótulos que señalan un sitio concreto de la captura —los pasos
 * sobre la tibia, los números sobre la consola— solo salen con la captura de
 * partida (`data-original`): sus posiciones se midieron sobre ella, y sobre
 * una foto que suba el administrador apuntarían a cualquier parte. Los que no
 * señalan nada —«Por segmento», «Axial»— salen siempre.
 *
 * Los rótulos son parte del dibujo y no texto comercial, y por eso no están
 * en «Medios de la página»: dicen qué se ve, como el `alt` de la foto.
 */

function Foto({ foto, sizes, className }: { foto: FotoParaPintar; sizes: string; className?: string }) {
  return (
    <ImagenConCarga
      src={foto.src}
      respaldo={foto.respaldo}
      alt={foto.alt}
      ancho={foto.ancho}
      alto={foto.alto}
      sizes={sizes}
      className={className}
    />
  )
}

/** Examina: la lupa sobre las rodillas, con el rótulo del segmento y el del video. */
export function IlustracionExamina({ foto }: { foto: FotoParaPintar }) {
  return (
    <figure className="p-ilus p-ilus-examina" data-original={foto.original || undefined}>
      <div className="p-lupa">
        <Foto foto={foto} sizes="(max-width: 900px) 80vw, 560px" className="p-lupa-foto" />
      </div>
      <span className="p-chip p-ilus-segmento" aria-hidden="true">
        <MapPin size={15} /> Por segmento
      </span>
      <span className="p-ilus-video" aria-hidden="true">
        <span className="p-ilus-video-boton">
          <Play size={30} />
        </span>
        <span className="p-chip p-chip-tono">Video propio de la maniobra</span>
      </span>
    </figure>
  )
}

const PASOS_AO = [
  { n: 1, rotulo: 'Abordaje', alto: 36 },
  { n: 2, rotulo: 'Reducción', alto: 56 },
  { n: 3, rotulo: 'Fijación', alto: 75 },
] as const

/** Técnica AO: la tibia en una tarjeta marina, con abordaje, reducción y fijación marcados. */
export function IlustracionTecnica({ foto }: { foto: FotoParaPintar }) {
  return (
    <figure className="p-ilus p-ilus-tecnica" data-original={foto.original || undefined}>
      <div className="p-tarjeta-marina">
        <Foto foto={foto} sizes="(max-width: 900px) 80vw, 440px" className="p-tecnica-foto" />
        <span className="p-chip p-chip-sobre-marino" aria-hidden="true">
          <ShieldCheck size={14} /> Principio AO
        </span>
        {foto.original ? (
          <ol className="p-tecnica-pasos" aria-label="Los tres tiempos de la técnica">
            {PASOS_AO.map((p) => (
              <li key={p.n} style={{ top: `${p.alto}%` }}>
                <span className="p-tecnica-numero" aria-hidden="true">
                  {p.n}
                </span>
                <span className="p-chip">{p.rotulo}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </figure>
  )
}

/** Dónde caen los tres números sobre la captura de la consola, en tanto por ciento. */
const MARCAS_DE_LA_CONSOLA = [
  { n: 1, x: 72.5, y: 38 },
  { n: 2, x: 41, y: 95 },
  { n: 3, x: 90, y: 68 },
] as const

/** Opera: la captura real de la consola, con los números de sus tres puntos. */
export function IlustracionOpera({ consola }: { consola: FotoParaPintar }) {
  return (
    <figure className="p-ilus p-ilus-opera" data-original={consola.original || undefined}>
      <div className="p-pantalla">
        <Foto foto={consola} sizes="(max-width: 900px) 92vw, 620px" />
        {consola.original
          ? MARCAS_DE_LA_CONSOLA.map((m) => (
              <span key={m.n} className="p-marca-numero" style={{ left: `${m.x}%`, top: `${m.y}%` }} aria-hidden="true">
                {m.n}
              </span>
            ))
          : null}
      </div>
    </figure>
  )
}

/**
 * Opera: la lupa de fluoroscopia, junto al botón del capítulo.
 *
 * Antes colgaba de la captura con posición absoluta y un desplazamiento a ojo
 * hacia la columna del texto: a 1366 px quedaba encima del hilo, y a 1024
 * encima del párrafo y del botón. Ahora es un elemento más de la fila del
 * botón: ocupa su sitio, la fila crece con ella y, si no cabe al lado, baja.
 */
export function LupaDeFluoroscopia({ foto }: { foto: FotoParaPintar }) {
  return (
    <div className="p-fluoro">
      <Foto foto={foto} sizes="230px" />
    </div>
  )
}

/** Interpreta: los tres planos de corte, cada uno en su círculo y con su nombre. */
export function IlustracionInterpreta({
  coronal,
  axial,
  sagital,
}: {
  coronal: FotoParaPintar
  axial: FotoParaPintar
  sagital: FotoParaPintar
}) {
  return (
    <figure className="p-ilus p-ilus-interpreta">
      {(
        [
          ['coronal', 'Coronal', coronal, '(max-width: 900px) 60vw, 390px'],
          ['axial', 'Axial', axial, '(max-width: 900px) 40vw, 240px'],
          ['sagital', 'Sagital', sagital, '(max-width: 900px) 40vw, 250px'],
        ] as const
      ).map(([clave, nombre, foto, sizes]) => (
        <div key={clave} className={`p-corte p-corte-${clave}`}>
          <div className="p-corte-circulo">
            <Foto foto={foto} sizes={sizes} />
          </div>
          <span className="p-corte-nombre" aria-hidden="true">
            {nombre}
          </span>
        </div>
      ))}
    </figure>
  )
}
