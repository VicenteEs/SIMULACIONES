# Capturas del modelo para la página y la portada de Figma

Imágenes reales del atlas de TraumaHub (el modelo completo de 2026-10-31, con la piel de D-228), hechas en Blender
y en el simulador. Ninguna es un dibujo ni una maqueta: son el modelo y el programa.

| Carpeta | Qué hay | Cómo se hizo |
|---|---|---|
| `capas/` | El cuerpo entero de frente por capas: piel, sin piel, músculos, esqueleto, vasos y órganos; y la piel y el esqueleto en tres cuartos | Blender (Cycles), PNG con fondo transparente, 1190 × 1870 px (órganos, 1360 × 1530) |
| `cortes/` | Cortes de verdad (la geometría se parte por el plano y se tapa): sagital del cuerpo y de la cabeza, coronal del tórax, axiales de cabeza, tórax, abdomen, muslo y pierna | Blender (Cycles), PNG con fondo transparente |
| `simulador/` | La consola del simulador con la fluoroscopia: `consola-*` es la pantalla entera del simulador, `arco-*` es solo la imagen redonda del arco en C (384 × 384 px, tal como la pinta el programa) | Chrome sobre el servidor de desarrollo, con la pierna del caso «Fractura de diáfisis tibial» |
| `portada/` | `portada.html` (el diseño), `portada.png` (1920 × 1080) y `portada@2x.png` | `scripts/atlas/capturas/portada-a-png.mjs` |

## Qué se ve en cada una

- **Capas.** `cuerpo-piel` es solo la piel (con la pigmentación de D-227 y D-228). `cuerpo-sin-piel` quita la piel y las fascias y
  deja músculo, hueso, vasos y órganos externos. `cuerpo-musculos` deja el músculo y el cráneo (el atlas no trae los músculos de
  la cara, y sin cráneo la cabeza queda vacía con los ojos flotando). `cuerpo-esqueleto`, `cuerpo-vasos` y
  `cuerpo-organos` dejan solo esa capa; los vasos van sobre el esqueleto para que se sitúen. No hay imagen de los nervios: el
  sistema nervioso del atlas es solo el encéfalo.
- **Cortes.** El color de la cara cortada es el del tejido (marfil el hueso, rojo el músculo), no el de su superficie. La piel y las
  fascias son láminas y no se tapan: el corte deja un anillo fino. Los músculos del atlas son superficies abiertas y no
  volúmenes, así que en los cortes axiales se ven como prismas de caras planas: valen para una página, no para una lámina de
  atlas impreso. Los cortes de muslo y pierna traen las dos extremidades (la segunda queda cortada por el borde): recortar a la
  que se quiera. Todos los PNG conservan el encuadre completo, con fondo transparente.
- **Simulador.** `arco-ap-1x` es la extremidad entera en AP; `arco-ap-2x`, `arco-lateral-2x` y `arco-oblicua-2x` están acercadas a
  la diáfisis de la tibia, con el fragmento distal desplazado 12,5 mm. `consola-musculo-y-hueso` y `consola-solo-hueso` son la
  vista 3D con las capas del panel izquierdo apagadas.

## Cómo se rehacen

Las capas y los cortes salen de `scripts/atlas/capturas/capas_y_cortes.py` (las rutas, absolutas):

```bash
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \
  --python scripts/atlas/capturas/capas_y_cortes.py -- \
  --blend D:/simulaciones/scripts/atlas/piel/salida/modelo-completo.blend \
  --salida D:/simulaciones/capturas-del-modelo/capas \
  --tomas cuerpo-piel,cuerpo-musculos,cuerpo-esqueleto --muestras 32 --escala 0.85
```

Cada capa tarda unos 20 s y cada corte entre 3 y 9 minutos (el coronal, con otras tomas dibujándose a la vez). Si el modelo cambia (otra piel, otra fascia), hay que rehacerlas: estas imágenes
son del modelo de hoy y no se actualizan solas.

### Las dos de la portada que no viven en esta carpeta (D-274, D-275)

Salen de los mismos huesos, pero no son capturas para Figma: son los originales de la portada, y cada guion los deja donde
los lee la página. La cabecera de cada uno dice cómo se corre.

| Qué | Guion | Dónde queda |
|---|---|---|
| La prueba de Lachman en video, para la lupa de Examina | `scripts/atlas/capturas/maniobra_lachman.py` | `public/portada/maniobra-lachman.mp4` y `.webm`, y el póster en `src/components/portada/imagenes/maniobra-lachman.webp` |
| La tibia con la fractura fijada con placa, para la tarjeta de Técnica AO | `scripts/atlas/capturas/tecnica_ao.py` | `src/components/portada/imagenes/tecnica-osteosintesis.webp` |

Si cambia el encuadre de la tibia, `--marcas` imprime dónde caen los tres pasos, y hay que copiarlos a `PASOS_AO` en
`src/components/portada/Ilustraciones.tsx`.

## Para ponerlas en Figma

El archivo «TraumaHub · Sitio web y aplicación» está en el plan Starter, que da 20 llamadas al mes al servidor de Figma, y se
agotaron. Cuando se renueve el cupo mensual (o con un plan de pago): subir los PNG con `upload_assets`, ponerlos como relleno de imagen
en la página «Portada» (vacía hoy) y en los marcos del prototipo que dicen «modelo 3D», y arreglar el menú del nodo `3:100`
(posición absoluta en x 0, y 0, sin relleno ni sombra). Mientras tanto, la portada se puede arrastrar a mano: `portada.png`
a un marco de 1920 × 1080.
