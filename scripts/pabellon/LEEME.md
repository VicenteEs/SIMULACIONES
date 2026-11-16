# El campo quirúrgico: colchón, sábana y paño

Los guiones de esta carpeta fabrican lo que el simulador pone alrededor del paciente (P-014): el colchón de la
camilla, la sábana con la huella del cuerpo y el paño que lo cubre entero, boca arriba y boca abajo. Las
decisiones están en `BITACORA.md`, de D-354 a D-359. Este archivo dice cómo se rehacen y cuándo hace falta.

## Qué viaja y qué no

Lo que el navegador carga está en `public/pabellon/`, y va en git:

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
  archivos `*-prueba.*` en `public/pabellon/`**, que viajarían con el despliegue.
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
monta el campo entero en node con los archivos que hay en `public/pabellon/`. Correrla después de regenerar:

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
- Para probar sin pisar lo bueno, `--destino` con otra carpeta: los `.glb` salen ahí y no en `public/pabellon/`.
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

Lo vigila `tests/unit/mueblesDelPabellon.test.ts`, que lee los `.glb` de `public/pabellon/` sin descomprimirlos:
que estén esos nombres, que la bandeja y la base midan lo que suponen los sitios de `src/lib/mesaDeArsenalera.ts`,
que ningún sitio fijo meta la base de la arsenalera en la de la camilla y que el peso no se dispare.

Hay que rehacer la arsenalera si cambia algún instrumento de `ejemplos/instrumental/` (se recoloca solo, pero si
uno crece puede dejar de caber en la compresa: el guion se para y dice cuál), y la mesa quirúrgica si cambian
las medidas del colchón.
