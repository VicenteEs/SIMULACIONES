# Cómo preparar un modelo y armar un caso quirúrgico

Guía para el traumatólogo. Cubre las dos mitades del trabajo: preparar el hueso
en Blender y escribir el caso en la plataforma. No hace falta saber programar,
pero sí seguir dos convenios al pie de la letra, porque de ellos dependen todas
las medidas que la consola le enseña al residente.

---

## Los dos convenios

**Primero: el hueso se exporta reducido.** No roto. En su sitio anatómico, como
debe quedar al terminar la operación. Lo que el residente ve al abrir el caso —el
fragmento desplazado— lo produce la plataforma a partir de unos números que usted
escribe en el caso.

Se hace así para que un mismo modelo sirva para varios casos: la misma tibia con
un desplazamiento de 12 mm es un caso fácil y con 40 mm es uno difícil, y cambiar
la dificultad son seis números, no volver a Blender.

La consecuencia de saltárselo es silenciosa y por eso conviene insistir: si el
hueso se exporta ya roto, la posición correcta que la consola usa de referencia
es la rota. Los milímetros que muestre serán creíbles y estarán mal, y el
residente aprenderá a reducir hacia el sitio equivocado sin que nada dé error.

**Segundo: cada pieza es un objeto con nombre.** La consola enciende y apaga
capas —piel, músculo, hueso— y mueve un fragmento por separado. Solo puede
hacerlo si en el archivo esas cosas son objetos distintos y usted le dice cómo se
llaman.

---

## En Blender

### 1. Separe las piezas

Un objeto por pieza. Como mínimo:

| Objeto | Para qué |
|---|---|
| El hueso principal | El fragmento que **no** se mueve |
| El fragmento | El trozo que el residente reduce |
| Músculo | Capa que se puede apagar |
| Piel | Capa que se puede apagar, y sobre la que se traza la incisión |

Para partir el hueso: seleccione el corte en modo edición y **P → Selección**.
Blender crea un objeto nuevo con la parte separada. Ese es el fragmento.

Hágalo **sin mover nada**. El corte separa, no desplaza: los dos trozos siguen
encajando exactamente donde estaban. Eso es el hueso reducido.

### 2. Póngales nombre

En el esquema de la derecha, doble clic sobre cada objeto. Nombres cortos, sin
tildes ni espacios: `tibia_proximal`, `tibia_distal`, `musculo`, `piel`.

No hace falta que los anote: en la plataforma se señalan con el ratón y el
nombre lo pone ella. Pero póngaselos igual, porque son lo que va a ver al
pinchar cada trozo, y `Cube.003` no le va a decir nada dentro de tres meses.

### 3. Compruebe el origen y la escala

Con todo seleccionado, **Objeto → Aplicar → Todas las transformaciones**. Así
Blender hornea rotación y escala en la geometría y ninguna pieza llega con una
transformación colgando que descuadre las medidas.

### 4. Exporte

**Archivo → Exportar → glTF 2.0 (.glb/.gltf)**, formato **glTF binario (.glb)**.

En el panel de la derecha:

- **Incluir → Objetos seleccionados**: solo si seleccionó las piezas. Si no,
  déjelo apagado y exporta la escena entera.
- **Datos → Malla → Aplicar modificadores**: encendido.
- **Comprimir**: encendido si el archivo pasa de unos pocos MB.

**El archivo debe pesar menos de 5 MB.** Ese es el techo real, y lo comprueba la
plataforma al subirlo. El motivo no es el servidor: el modelo se descarga en el
navegador del residente, muchas veces en un portátil modesto y con la red del
hospital. Si se pasa, baje el número de caras con un modificador **Decimate**
antes de exportar.

### Si el modelo sale del taller del atlas

No hace falta pasar por Blender: en **Taller anatómico → Exportar como modelo**
la plataforma escribe el `.glb` por usted, con los nombres de las piezas en
español y, dentro del archivo, la capa de la simulación que le toca a cada una
(piel, músculo o hueso). Al elegir ese modelo en un caso, el taller de piezas
tiene un botón **Rellenar desde el modelo** que escribe las piezas sin teclear
nada.

Si aun así lo abre en Blender para retocarlo y lo vuelve a exportar, marque
**Incluir → Propiedades personalizadas** (*Custom Properties*), que viene
**apagado** por omisión. Ahí viajan las capas: sin esa casilla el modelo se ve
igual y funciona, pero «Rellenar desde el modelo» ya no sabe qué es cada pieza y
habrá que ponerlo a mano.

Los modelos exportados del atlas **antes del 13 de septiembre de 2026** llevan
los nombres en inglés y ninguna capa dentro: vuelva a exportarlos.

### Partir el hueso al exportar

Tampoco hace falta Blender para romper el hueso. En el mismo panel de
**Exportar como modelo**:

1. Marque el hueso como pieza **suelta**. Solo una pieza suelta se puede partir:
   fundida con el resto del esqueleto, el «fragmento» sería el esqueleto entero.
2. Al lado aparece **Partir con un corte**. Márquela. Sale solo en los huesos: un
   músculo partido no es una fractura, y el peroneo corto, que el atlas de origen
   guarda con los huesos, no la ofrece. Cabe un corte por archivo, porque un caso
   mueve un fragmento y nada más.
3. Ajuste los cuatro mandos mirando el disco magenta que aparece sobre el hueso:

| Mando | Qué decide |
|---|---|
| Posición, de proximal a distal | A qué altura corta, del 5 al 95 % de la longitud del hueso. El 50 % es media diáfisis |
| Inclinación | Los grados entre el trazo y la perpendicular al eje. 0 es **transversal**; hasta 60° |
| Más proximal por la cara | Por qué cara sube el trazo cuando es oblicuo: anterior, lateral, posterior, medial… Lateral es hacia fuera del cuerpo en las dos piernas |
| Fragmento que se mueve | El trozo que el residente reduce. Distal por omisión, que es el que se tracciona en quirófano |

Debajo se lee el corte con palabras, y esa misma frase queda en las notas del
modelo.

El eje del hueso lo mide la plataforma sobre la forma del hueso, no sobre su
caja, así que un corte «transversal» de fémur es transversal al fémur y no al
suelo. Los mandos de la vista previa y el archivo usan la misma cuenta: lo que ve
en el disco es lo que sale.

**Qué corte pide cada fractura.** Es la manera de que el modelo diga lo mismo que
la clasificación del caso:

| Clasificación AO (diáfisis) | Corte |
|---|---|
| A3 · simple transversa (trazo a menos de 30°) | Inclinación 0: transversal |
| A2 · simple oblicua (30° o más) | Inclinación de unos 45°: lejos del borde de los 30° y del tope de 60° |
| A1 · simple espiroidea | No se puede: un corte es un plano. Una oblicua de 45° es lo más parecido, y el trazo que se ve es recto |
| B y C · en cuña y complejas | No se puede: dejan tres fragmentos o más, y un corte da dos |

**Qué sale.** El hueso partido son dos objetos, los dos cerrados por la cara del
corte, que encajan exactamente: el hueso sigue exportándose **reducido**, como
pide el primer convenio. Se llaman como el hueso y su lado, sin tildes ni comas:
`Tibia_derecha_fragmento_proximal` y `Tibia_derecha_fragmento_distal`. El que
eligió como fragmento lleva ya dentro el papel de **fragmento móvil**, así que
**Rellenar desde el modelo** lo marca solo, y el otro entra como hueso fijo.

El fragmento trae además su origen en el foco de la fractura, no en el centro
del modelo. Es sobre ese punto donde gira en la consola: al corregir una
angulación, el trozo gira sobre el foco en vez de irse de lado.

Si el hueso del atlas tiene algún agujero en la malla, el corte sale igual pero
alguna tapa puede quedar sin cerrar; lo dicen las notas del modelo, en primer
lugar.

### Poner una preparación en el caso de prueba

Para el caso de prueba hay un guion que hace todo lo anterior de una vez con la
preparación **pierna derecha**: la exporta con la tibia derecha partida según la
clasificación del caso —42-A2, así que oblicua de 45°, más proximal por la cara
lateral, a media diáfisis y moviendo el distal—, pone ese modelo en el caso,
rellena las piezas como el botón y cambia lo que ve cada paso por su papel: el
paso que enseñaba la piel sigue enseñando la piel, el que enseñaba el hueso fijo,
el trozo proximal y el resto del esqueleto, y el del fragmento, el fragmento. El
desplazamiento inicial y las tolerancias se quedan como estaban: van en
milímetros y no dependen del archivo.

Se ejecuta en el servidor, desde la carpeta del proyecto:

```bash
npx tsx scripts/pierna-derecha-en-el-caso.ts             # solo dice qué cambiaría
npx tsx scripts/pierna-derecha-en-el-caso.ts --aplicar   # lo escribe
```

Sin `--aplicar` no escribe nada: enseña el modelo que crearía, las piezas que
quitaría y pondría, y cómo queda cada paso. Léalo antes de aplicar. Se puede
lanzar las veces que haga falta: cada vez exporta primero sin guardar nada y
compara ese archivo con el del modelo que ya exportó. Si es idéntico, lo
reutiliza y dice que no hay nada que cambiar; guardar otra vez la preparación sin
tocar sus piezas no crea otro. Si ha cambiado lo que sale —otras piezas en la
preparación, o una corrección del atlas o del exportador, aunque la versión del
atlas sea la misma—, crea el modelo nuevo y lo pone en el caso. Por eso, cuando se
corrija algo del atlas, basta con volver a lanzarlo. Lo mismo pasa si alguien
volvió a subir a mano el archivo de ese modelo: el guion no lo reconoce como
suyo, y al simular lo dice antes de que usted decida aplicar.

Para sin tocar nada, y dice por qué, si no encuentra la preparación o encuentra
varias con ese nombre (no distingue mayúsculas ni tildes), si no incluye la tibia
derecha, si la clasificación del caso no se puede hacer con un corte o si el caso
tiene cambios en borrador sin publicar. Con `--preparacion "<nombre>"` y
`--caso "<nombre>"` sirve para otra preparación u otro caso de diáfisis tibial.

Si quiere ver cómo debe quedar, `ejemplos/tibia-de-prueba.glb` es un
ejemplo mínimo con esos cuatro objetos.

---

## En la plataforma

### 1. Suba el modelo

**Contenido → Material de apoyo → Modelos 3D → + Nuevo.** Nombre y archivo.

### 2. Revise el vocabulario

Los pasos del caso apuntan a cinco catálogos que usted mantiene, en **Contenido →
Material de apoyo**:

| Catálogo | Qué guarda |
|---|---|
| Huesos AO | Tibia (diáfisis) · 42 |
| Clasificaciones AO | A2 · Simple oblicua · tipo A |
| Técnicas quirúrgicas | Clavo endomedular |
| Fases quirúrgicas | Abordaje, Reducción, Fijación, Cierre |
| Instrumental | Bisturí N°10, punzón de entrada, fresa flexible… |

Añada lo que falte **antes** de escribir el caso, así lo elige de una lista en
vez de interrumpir a mitad. Cada instrumento lleva además un icono, que es lo que
el residente ve en la bandeja.

### 3. Escriba el caso

**Contenido → Cirugías → + Nueva.**

**Identificación.** Nombre, resumen, y el hueso, la clasificación y la técnica de
los catálogos. El código AO de la esquina del lienzo se compone solo con el
número del hueso y el de la clasificación: 42 y A2 dan `42-A2`. Solo escriba el
campo Código si su fractura no sigue esa suma.

**El modelo.** Elija el que subió. Dos campos más lo acompañan:

- **Milímetros por unidad**: cuánto mide en milímetros una unidad de Blender.
  Si modeló en metros —lo normal—, es `1000`. Este número decide si la consola
  dice 12 mm o 12 metros.
- **Eje largo**: por qué eje corre el hueso. Casi siempre `Y`. Separa la
  diástasis, que es el hueco a lo largo, del desplazamiento, que es lo que se va
  de lado.

**Las piezas.** En cuanto elige el modelo aparece debajo, en el **taller de
piezas**. Ahí no se escribe nada:

1. Con **Señalar piezas** activo, pinche cada trozo del modelo. Se añade solo,
   con su nombre exacto. Los objetos que el archivo trae y usted todavía no ha
   usado salen listados encima, y también se añaden pinchándolos.
2. Elija qué es cada uno en la columna de al lado.
3. **Solo esto** esconde el resto para comprobar que pinchó lo que creía.

| Papel | Qué hace la consola con él |
|---|---|
| Piel | Capa apagable. Es donde se traza la incisión |
| Músculo | Capa apagable |
| Hueso fijo | Capa apagable. La parte que no se mueve |
| Fragmento móvil | **El trozo que el residente reduce.** Solo uno |
| Implante | Clavo, placa o tornillo |

De fragmento móvil solo puede haber uno. Si marca un segundo, el primero pasa a
hueso fijo solo: dos fragmentos no darían error, darían un caso en el que se
mueve el que no es.

Si una fila queda en rojo diciendo «no está en este archivo», es que nombra un
objeto que el modelo no trae. Esa capa no aparecería nunca, y antes eso no lo
avisaba nadie.

**El desplazamiento inicial.** Aquí es donde se rompe el hueso, sin Blender, y
tampoco hay que escribir números. Pase a **Colocar el fragmento**, arrástrelo
hasta que la fractura se vea como quiere enseñarla, y pulse **Capturar
desplazamiento**: los seis se rellenan solos. Siguen ahí debajo por si quiere
afinarlos a mano.

El caso de prueba usa 12,5 mm de lado, 18 mm de separación y 9,8° de angulación,
que es una fractura desplazada de aspecto realista, por si quiere una referencia
de cuánto es mucho.

### 4. Escriba los pasos

Un paso es un gesto que el residente ejecuta y la consola evalúa. Cada uno lleva
título, fase, descripción, el instrumento correcto y los puntos que vale.

Lo que decide todo lo demás es **el objetivo**, que es lo que se le mide:

| Objetivo | Qué tiene que hacer el residente | Qué escribe usted |
|---|---|---|
| Instrumento | Elegir el instrumento correcto | Nada más |
| Trazo | Dibujar una incisión sobre el modelo | Largo mínimo y máximo, en mm |
| Reducción | Poner el fragmento en su sitio | Tolerancia de desplazamiento, de diástasis y de angulación |
| Fuerza | Graduar la fuerza | Rango útil, en newtons |

Los tres mensajes del final de cada paso son la enseñanza del módulo, y conviene
escribirlos con cuidado:

- **Éxito**: qué se consiguió. Se lee al acertar.
- **Insuficiente**: qué falta. Es un reintento, no cuesta nada.
- **Excesivo**: qué se dañó. Cuenta como **complicación** y queda registrada.

Esa última distinción es la razón de ser del simulador. Pasarse fresando no es
«casi bien»: es necrosis térmica que se ve a los tres meses. Escriba ahí lo que
le diría a un residente en pabellón.

**Muestra.** Qué piezas se ven durante ese paso. En el paso de la incisión, la
piel; en los de reducción, los dos fragmentos. Deje que el residente vea lo que
vería de verdad en ese momento de la operación.

**Riesgo.** Una o dos líneas sobre qué puede salir mal. Se muestra junto al paso.

### 5. Publique

Botón **Publicar**. Mientras esté en borrador, el residente no lo ve.

---

## Un ejemplo completo

`scripts/caso-de-prueba.ts` arma una fractura de diáfisis tibial 42-A2 tratada
con clavo endomedular, en siete pasos y 150 puntos, con los cinco catálogos y el
modelo. Se ejecuta así:

```bash
npx tsx scripts/caso-de-prueba.ts
```

Se puede lanzar las veces que haga falta: no duplica los catálogos ni pisa lo que
usted haya cambiado a mano. Sirve para ver un caso bien escrito por dentro antes
de escribir el primero.

---

## Cuando algo no cuadra

| Lo que ve | Qué suele ser |
|---|---|
| El modelo se abre vacío o diminuto | «Milímetros por unidad» está mal. Con `1` en un modelo hecho en metros, el hueso mide un milímetro |
| Una capa no se apaga | El nombre de la pieza no coincide con el objeto de Blender. Distingue mayúsculas |
| Nada se mueve en modo Mover | Ninguna pieza tiene el papel **fragmento** |
| El fragmento no se ve al empezar | El desplazamiento inicial es enorme y lo sacó del encuadre. Pruebe con decenas de milímetros, no cientos |
| Las medidas no bajan al arrastrar | Lo que queda está en profundidad. Mire el desglose por ejes bajo el número y gire la cámara con Orbitar |
| El archivo no sube | Pasa de 5 MB. Reduzca caras con Decimate y exporte comprimido |
