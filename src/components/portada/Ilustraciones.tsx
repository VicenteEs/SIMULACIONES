import { MapPin, ShieldCheck } from 'lucide-react'
import { ImagenConCarga } from '@/components/ui/ImagenConCarga'
import { ruta } from '@/lib/rutas'
import type { FotoParaPintar } from './fotos'
import { LupaConVideo, type FuenteDeVideo } from './LupaConVideo'

/**
 * Las ilustraciones de los capítulos Examina, Técnica AO, Opera e Interpreta
 * (la de Estudia es interactiva y vive en `CapasDelCuerpo`).
 *
 * Cada una es una foto de «Medios de la página» con su marco y unos rótulos
 * encima. Los rótulos que señalan un sitio concreto de la captura —los pasos
 * sobre la tibia, los números sobre la consola— solo salen con la captura de
 * partida (`data-original`): sus posiciones se midieron sobre ella, y sobre
 * una foto que suba el administrador apuntarían a cualquier parte. Los que no
 * señalan nada —«Por segmento», «Axial»— salen siempre. El video de Examina
 * también va solo con la de partida, que es su póster: sobre otra foto
 * correría una rodilla que no es la que se ve.
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

/**
 * El video de la prueba de Lachman (D-274), en el orden en que se prueban. El
 * WebM va primero: pesa una cuarta parte y cierra el bucle sin salto; el MP4
 * queda para el navegador que no lea VP9. Escritas a mano, las dos rutas
 * pasan por `ruta()`.
 */
const VIDEO_DEL_LACHMAN: readonly FuenteDeVideo[] = [
  { src: ruta('/portada/maniobra-lachman.webm'), tipo: 'video/webm; codecs="vp9"' },
  { src: ruta('/portada/maniobra-lachman.mp4'), tipo: 'video/mp4' },
]

/**
 * Examina: la lupa con la prueba de Lachman en video y el rótulo del segmento.
 * Con una foto subida, la lupa la muestra quieta y sin el botón: un «play»
 * que no reproduce nada promete un video que no hay.
 */
export function IlustracionExamina({ foto }: { foto: FotoParaPintar }) {
  return (
    <figure className="p-ilus p-ilus-examina" data-original={foto.original || undefined}>
      {foto.original ? (
        <LupaConVideo foto={foto} fuentes={VIDEO_DEL_LACHMAN} />
      ) : (
        <div className="p-lupa">
          <Foto foto={foto} sizes="(max-width: 900px) 80vw, 560px" className="p-lupa-foto" />
        </div>
      )}
      <span className="p-chip p-ilus-segmento" aria-hidden="true">
        <MapPin size={15} /> Por segmento
      </span>
    </figure>
  )
}

/**
 * Dónde caen los tres números sobre la osteosíntesis de partida (D-275), en
 * tanto por ciento de la tarjeta: el centro de cada círculo. Van pegados al
 * borde de la tibia y no encima de lo que señalan: en una tarjeta de 440 px
 * un círculo de 28 px tapaba justo eso —la placa mide unos 18 px de ancho y
 * del trazo asoman dos puntas de 7—. La línea que sale de cada uno cruza la
 * placa a su altura: el extremo proximal, el trazo y los tornillos distales.
 */
const PASOS_AO = [
  { n: 1, rotulo: 'Abordaje', x: 26.6, y: 48 },
  { n: 2, rotulo: 'Reducción', x: 28.6, y: 62.4 },
  { n: 3, rotulo: 'Fijación', x: 29.6, y: 70.7 },
] as const

/** La mitad del círculo del número (`.p-tecnica-numero`): `left` es su borde y `PASOS_AO`, su centro. */
const MEDIO_CIRCULO_PX = 14

/** Técnica AO: la tibia fracturada y fijada con su placa, en una tarjeta marina, con abordaje, reducción y fijación marcados. */
export function IlustracionTecnica({ foto }: { foto: FotoParaPintar }) {
  return (
    <figure className="p-ilus p-ilus-tecnica" data-original={foto.original || undefined}>
      <div className="p-tarjeta-marina">
        <Foto foto={foto} sizes="(max-width: 900px) 80vw, 440px" className="p-tecnica-foto" />
        <span className="p-chip p-chip-sobre-marino" aria-hidden="true">
          <ShieldCheck size={14} /> Principios AO
        </span>
        {foto.original ? (
          <ol className="p-tecnica-pasos" aria-label="Los tres tiempos de la técnica">
            {PASOS_AO.map((p) => (
              <li key={p.n} style={{ left: `calc(${p.x}% - ${MEDIO_CIRCULO_PX}px)`, top: `${p.y}%` }}>
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
