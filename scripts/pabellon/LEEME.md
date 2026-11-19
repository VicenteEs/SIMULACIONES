# El campo quirúrgico: colchón, sábana y paño

Los guiones de esta carpeta fabrican lo que el simulador pone alrededor del paciente (P-014): el colchón de la
camilla, la sábana con la huella del cuerpo y el paño que lo cubre entero, boca arriba y boca abajo. Las
decisiones están en `BITACORA.md`, de D-354 a D-359. Este archivo dice cómo se rehacen y cuándo hace falta.

## Qué viaja y qué no

Lo que el navegador carga está en `privado/pabellon/`, y va en git. No en `public/`: desde D-419 lo sirve
`src/app/(frontend)/pabellon/[archivo]/route.ts` solo a quien tiene sesión, en la misma dirección `/pabellon/…`. Un
archivo que vuelva a `public/pabellon/` lo taparía y quedaría abierto para cualquiera, y
`tests/unit/archivosDelPabellon.test.ts` falla si aparece.

| Archivo | Qué es | Lo hace |
|---|---|---|
| `colchon.glb` | el colchón, 84 × 196 × 11 cm, con su tira de la pared | `generar.py --etapa colchon` |
| `campo-supino.glb`, `campo-prono.glb` | la sábana y el paño ya caído, de cada decúbito | `generar.py --etapa campo` |
| `relieve-supino.bin`, `relieve-prono.bin` | dos rejillas de alturas en celdas de 6 mm: dónde hay cuerpo, y el lecho donde se pega el borde de la ventana | `generar.py --etapa campo` |
| `manifiesto.json` | medidas, ejes y nombres de archivo. El simulador no sabe nada que no diga aquí | `generar.py` |
| `tela-relieve.webp`, `tela-pliegues.webp`, `colchon-grano.webp`, `colchon-pared.webp` | mapas de normales de la tela y del forro | `texturas.py` |

Lo intermedio va a `scripts/pabellon/salida/` y no viaja (está en `.gitignore`). Ahí quedan la tela ya caída
(`pano-supino.npz`, `pano-prono.npz`), que es lo caro de rehacer, el registro de cada simulación y las fotos de
`vistas.py`.

## Lo que hace falta

- **Blender 5.2 LTS.** En esta máquina está en `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.
  `generar.py` y `vistas.py` corren dentro de él y solo usan el numpy que trae.
- **Python 3 con numpy y Pillow**, para `texturas.py` y `medir.py`, que no pasan por Blender.
- **La piel del atlas**, que se lee de `public/atlas/` con el mismo `Atlas` de `scripts/atlas/fascias/atlas.py`.

## Las órdenes

Desde la raíz del proyecto:

```bash
python scripts/pabellon/medir.py
python scripts/pabellon/texturas.py
blender --background --factory-startup --python scripts/pabellon/generar.py -- --etapa todo
blender --background --factory-startup --python scripts/pabellon/vistas.py -- --decubito supino --ventana rodilla
```

- `medir.py` no escribe nada: dice cuánto se hunde y cuánto flota cada zona del cuerpo sobre el plano de apoyo.
  Con esa cuenta se eligieron la inclinación del colchón y los cojines (`PLANO` y `COJINES`, en `comun.py`).
- `generar.py` acepta `--etapa colchon | simular | campo | todo` y `--decubito supino | prono | ambos`.
  **Simular es lo caro**: unos once minutos por decúbito en el equipo de desarrollo. `--etapa campo` rehace los
  `.glb`, el relieve y el manifiesto en segundos a partir de la tela que ya cayó.
- Para probar algo sin pisar lo bueno, `--sufijo -prueba`: lo intermedio sale con ese sufijo. **No dejar
  archivos `*-prueba.*` en `privado/pabellon/`**, que viajarían con el despliegue.
- `vistas.py` fotografía los mismos `.glb` que carga el simulador, no lo intermedio, y puede abrir una ventana de
  muestra (`--ventana`) o quitar el paño o la piel (`--sin-pano`, `--sin-piel`). Las fotos van a
  `salida/vistas/`. No es el aspecto final, que lo dan las luces del simulador. Sirve para decidir la forma
  y el color sin abrir el navegador.

## Cuándo hay que rehacerlo

- **Si la piel del atlas se regenera.** Primero `medir.py`: una pantorrilla que queda tres centímetros en el
  aire no da ningún error, solo una pierna que flota sobre la sábana. Después, simular otra vez los dos decúbitos.
- **Si cambian las medidas del colchón**, simular otra vez: el paño cae sobre él.
- **Si solo cambia un color o un nombre**, basta `--etapa campo`.

## Lo que se rompe en silencio

El simulador lee todo a través de `manifiesto.json` y de los nombres de las mallas. Si un cambio en
`generar.py` renombra una malla, cambia el tamaño del relieve o quita un campo del manifiesto, el caso abre sin
campo y el lienzo solo avisa en la consola del navegador. Lo vigila `tests/unit/campoEnLaEscena.test.ts`, que
monta el campo entero en node con los archivos que hay en `privado/pabellon/`. Correrla después de regenerar:

```bash
npx vitest run tests/unit/campoEnLaEscena.test.ts tests/unit/campoQuirurgico.test.ts
```

Todo va en las coordenadas del cuerpo del atlas: metros, Y hacia la cabeza, +Z hacia delante. El `.glb` sale ya
en las coordenadas en que el taller exporta el recorte, y el simulador solo le resta el mismo centro. Por qué se
trabaja así, y por qué el paño se simula y la sábana no, está al principio de `comun.py` y de `generar.py`.

## Los muebles: la arsenalera y la mesa quirúrgica

`mobiliario.py` hace los dos muebles que el simulador pone junto a la camilla. No dependen del atlas ni de la
tela caída de `generar.py`: solo del instrumental de `ejemplos/instrumental/` y del `colchon.glb`, que se trae
para hornear su sombra y para la foto de conjunto, y no se exporta.

| Archivo | Qué es | Lo hace |
|---|---|---|
| `mesa-arsenalera.glb` | la mesa de Mayo: base de cuatro ruedas, poste telescópico y bandeja de 60 × 40 cm con su funda caída, la compresa, el instrumental, las gasas, la riñonera y la cápsula | `mobiliario.py --pieza arsenalera` |
| `mesa-quirurgica.glb` | el tablero de tres secciones con sus rieles, la columna, la base y el mando colgado del riel, en los mismos ejes que `colchon.glb` | `mobiliario.py --pieza quirurgica` |

```bash
blender --background --factory-startup --python scripts/pabellon/mobiliario.py -- --pieza todo --vistas
```

- `--pieza arsenalera | quirurgica | todo`. Las dos juntas tardan poco más de un minuto con las fotos; la funda,
  que es lo único que se simula, unos veinte segundos.
- `--vistas` deja en `salida/vistas/` cada mueble solo desde dos o tres lados y, con `--pieza todo`, los dos
  juntos con el colchón puesto (`conjunto-*.png`). `--muestras` baja la calidad de esas fotos para probar.
- Para probar sin pisar lo bueno, `--destino` con otra carpeta: los `.glb` salen ahí y no en `privado/pabellon/`.
- Sale igual byte a byte en dos pasadas: la tela parte siempre de la misma forma, y los horneados de Cycles
  llevan semilla fija. Si un `.glb` cambia sin haber tocado el guion, algo de fuera cambió (Blender, el
  instrumental, el colchón).

Lo que el simulador busca por su nombre, y que un cambio aquí no debe renombrar: en la arsenalera, `base`,
`elevable` (todo lo que sube con el poste, que el simulador traslada en +Y de 0 a 35 cm), `funda` (sin textura
de color: el simulador la tiñe con el color del paño del caso), `compresa` y `sombra`; en la mesa quirúrgica,
`tablero`, `columna`, `base` y `sombra`; el mando y su cable van aparte, en `mando`, para que no estiren la caja
del tablero hasta medio metro del suelo. La arsenalera tiene el origen en el suelo bajo el centro de la bandeja,
con el poste hacia −X y la cara de arriba de la bandeja a 98 cm; la mesa quirúrgica, el del colchón. Por qué
cada pieza es como es está en los comentarios de `mobiliario.py`.

Lo vigila `tests/unit/mueblesDelPabellon.test.ts`, que lee los `.glb` de `privado/pabellon/` sin descomprimirlos:
que estén esos nombres, que la bandeja y la base midan lo que suponen los sitios de `src/lib/mesaDeArsenalera.ts`,
que ningún sitio fijo meta la base de la arsenalera en la de la camilla y que el peso no se dispare.

Hay que rehacer la arsenalera si cambia algún instrumento de `ejemplos/instrumental/` (se recoloca solo, pero si
uno crece puede dejar de caber en la compresa: el guion se para y dice cuál), y la mesa quirúrgica si cambian
las medidas del colchón.

## El pabellón: la sala entera alrededor de la camilla

`sala.py` hace `sala.glb`: paredes, techo, piso y todo el equipo de un pabellón, en el marco del colchón (D-417).
No modela la camilla, que la pone el simulador. `texturas_sala.py` hace sus texturas con numpy y Pillow (mapas de
normales, el atlas de rótulos, las pantallas) en `salida/sala/`.

```bash
blender --background --factory-startup --python scripts/pabellon/sala.py -- --vistas
```

- Tarda unos 25 s sin fotos; casi todo es el horneado de la oclusión, con Cycles en procesador.
- Por omisión hornea con 192 muestras, las del archivo publicado. Sin opciones sale igual byte a byte que el de
  `privado/pabellon/`; si cambia sin haber tocado el guion, algo de fuera cambió.
- `--vistas` deja las fotos en `salida/vistas/sala-*.png`: desde la camilla (`cabecera`, `pies`, `costado-derecho`,
  `costado-izquierdo`, `rincon`), la `cenital` sin techo y la `planta` numerada. `--vistas-cuales` elige cuáles, y
  `cerca-<pieza>` saca el detalle de una pieza. `--solo-vistas` fotografía el `.glb` que ya hay, sin rehacerlo.
- `--sin-oclusion` no hornea: sirve para probar la forma en segundos, pero el `.glb` sale sin oclusión y no se publica.
- Las texturas se hacen solas si faltan. Si se cambia `texturas_sala.py`, hay que rehacerlas a mano con
  `python scripts/pabellon/texturas_sala.py`, porque `sala.py` no mira si están al día.

**Repintar y reordenar.** Los colores están en la tabla `PINTURA` y la posición de cada cosa en `DISPOSICION`, las
dos al principio del guion. La foto `sala-planta.png` numera cada entrada de `DISPOSICION`. Para probar un color
sin Blender está `PINTURA_DEL_PABELLON`, en `src/lib/pabellonCompleto.ts`.

**El guion para si algo falla:**
- `comprobar_zonas` mide cada pieza del piso y falla si invade la zona libre de la mesa y la arsenalera (|x| ≤ 2 y
  −1,3 ≤ z ≤ 2,6, ni a menos de 2,6 m del centro, salvo la anestesia en la cabecera), si se sale de la sala o si
  pisa otra pieza.
- `comprobar_las_caras` falla si una pieza cerrada tiene las caras hacia dentro.
- `comprobar_el_techo` falla si algo pegado al techo tiene una cara hacia arriba.

Lo que el simulador busca por su nombre, y que un cambio aquí no debe romper:
- **Los tres grupos raíz:** `estructura`, `equipos` y `colgantes`.
- **Los colgantes**, cada uno un nodo `colgante-*` con su pivote en el anclaje al techo. El simulador los aparta
  cuando tapan al paciente, así que cada uno tiene que ser un nodo entero y compacto.
- **Los materiales `pintura-*`**, que son los repintables.
- **El piso, `piso-vinilo`**, el único material que recibe sombra.

Todo es de una cara: el simulador deja ver la sala desde fuera y desde arriba, y una cara de más la cerraría. Lo
vigila la parte de la sala de `tests/unit/mueblesDelPabellon.test.ts`.

## La arsenalera de pie

`arsenalera_a_la_web.py` lleva al simulador la arsenalera que el dueño modela a mano: de
`salida/arsenalera_manual/arsenalera_manual.blend` a `privado/pabellon/arsenalera-persona.glb` (D-418).

```bash
blender --background --factory-startup --python scripts/pabellon/arsenalera_a_la_web.py
```

- **La fuente no se escribe nunca.** El guion la copia a una carpeta temporal y abre la copia, que tampoco guarda.
  `salida/arsenalera_manual/` es del dueño, que sigue modelando ahí: no se borra, no se rehace y ningún guion
  escribe en ella.
- El `.glb` publicado es una foto del `.blend` del momento en que se corrió. Para ver en el simulador lo último que
  modeló el dueño, hay que volver a correrlo.
- Sin opciones sale igual byte a byte que el publicado. Si cambia sin haber tocado el `.blend` ni el guion, algo de
  fuera cambió, como la versión de Blender.
- `--destino <carpeta>` lo deja en otra parte, para probar sin pisar lo que viaja. `--fuente` lee otro `.blend`.
- `--lado-color`, `--lado-relieve` (0 deja fuera el relieve), `--calidad`, `--cofia` y `--muestras` cambian el peso
  y la sombra. Sus omisiones son las del publicado.

**Qué hace con cada pieza.** El detalle y el porqué están al principio del guion:
- La figura se parte por material en `bata`, `pantalon`, `guantes` y `zapatos`, con sus atlas en 1024 y WebP.
- La cabeza va con sus modificadores aplicados, menos la Subdivisión y la Solidificación de la cofia, que se simplifica.
- Los lentes van sin transmisión.
- La cara lleva la foto con su alfa.
- La sombra de contacto se hornea como la de la mesa.
- Lo que los materiales hacen con nodos no viaja.

**El guion para si algo falla.** Comprueba:
- los pies en el suelo, la cofia a la altura de una persona y la cara por delante de la cabeza;
- que lo que baja hasta la altura de las patas de la mesa quepa en `radioDeLosPies`;
- que nada pase delante de la funda de la mesa;
- el peso, bajo 1,2 MB.

Las medidas las lee de `src/lib/mesaDeArsenalera.ts` y de `mobiliario.py`, no de una copia.

Lo que el simulador busca por su nombre:
- **La raíz** `arsenalera-persona`, con el origen en el suelo entre los pies y mirando a +Z.
- **Las piezas** `bata`, `pantalon`, `guantes`, `zapatos`, `cabeza`, `cara`, `gorro`, `mascarilla` y `gafas`, y la
  `sombra`.
- **Lo que pincha:** la bata, los guantes y el gorro.

Lo vigila la parte de la arsenalera de pie de `tests/unit/mueblesDelPabellon.test.ts`.
