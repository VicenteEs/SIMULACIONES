# Atribución del atlas anatómico

La geometría anatómica de esta plataforma procede de **BodyParts3D**, y su
licencia obliga a citarla allí donde se muestre. Este archivo es la fuente de
ese crédito; la página de créditos de la plataforma lo reproduce.

## Crédito exigido

> BodyParts3D, © The Database Center for Life Science licensed under
> CC Attribution 4.0 International

- Licencia: https://creativecommons.org/licenses/by/4.0/
- Términos del origen: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
- Conjunto de datos: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- Publicación: Mitsuhashi et al. (2009), *BodyParts3D: 3D structure database for
  anatomical concepts*. https://doi.org/10.1093/nar/gkn613

Los comentarios de los archivos OBJ originales mencionan una licencia anterior,
CC BY-SA 2.1 Japón. La página oficial vigente la sustituye por CC BY 4.0, que no
obliga a compartir igual.

## Cambios realizados

CC BY 4.0 exige indicar si se modificó el material. Se modificó así:

- ejes y unidades convertidos de milímetros y Z arriba a metros y Y arriba;
- geometría simplificada con meshoptimizer, con un límite de error relativo del
  0,2 % por estructura; las 2.234 mallas de origen se conservan todas;
- normales cuantizadas a entero de 16 bits con signo;
- geometría empaquetada en 15 archivos binarios comprimidos;
- añadida una clasificación por **región anatómica** que el material original no
  traía: se toma de los conceptos FMA de región del propio atlas (cabeza, tórax,
  miembro superior derecho) cuando la pieza figura entre sus elementos y, si no,
  se deduce de la posición de su caja envolvente;
- traducidos al español los nombres de los sistemas y de las regiones;
- traducidos al español, para enseñarlos, los nombres de las estructuras. La
  traducción no sustituye al original: el nombre de BodyParts3D se conserva al
  lado, porque es el que se puede buscar en la bibliografía y en la Foundational
  Model of Anatomy. Una estructura que todavía no tiene traducción se enseña con
  su nombre original, sin traducirla a ciegas;
- corregido el sistema anatómico de 14 estructuras que el material original
  clasifica mal. La geometría no cambia: cambia el grupo en el que se pintan, se
  encienden y se apagan.

La preparación intermedia procede de https://github.com/ashemag/human-atlas
(código bajo licencia MIT), que documenta las cuatro primeras adaptaciones.

Las 14 correcciones de sistema son estas:

- Right fibularis brevis (peroneo corto derecho): de esqueleto a músculos;
- Left fibularis brevis (peroneo corto izquierdo): de esqueleto a músculos;
- Right fibularis longus (peroneo largo derecho): de esqueleto a músculos;
- Left fibularis longus (peroneo largo izquierdo): de esqueleto a músculos;
- Right fibularis tertius (peroneo tercero derecho): de esqueleto a músculos;
- Left fibularis tertius (peroneo tercero izquierdo): de esqueleto a músculos;
- Right tibialis anterior (tibial anterior derecho): de esqueleto a músculos;
- Left tibialis anterior (tibial anterior izquierdo): de esqueleto a músculos;
- Right tibialis posterior (tibial posterior derecho): de esqueleto a músculos;
- Left tibialis posterior (tibial posterior izquierdo): de esqueleto a músculos;
- Right iliotibial tract (cintilla iliotibial derecha): de esqueleto a tejido
  conectivo;
- Left iliotibial tract (cintilla iliotibial izquierda): de esqueleto a tejido
  conectivo;
- Gingiva of upper jaw (encía del maxilar superior): de esqueleto a aparato
  digestivo;
- Gingiva of lower jaw (encía de la mandíbula): de esqueleto a aparato
  digestivo.

El porqué: los tres peroneos, el tibial anterior y el tibial posterior son
músculos de la pierna, y la cintilla iliotibial es un engrosamiento de la fascia
lata; ninguno es hueso. En el atlas de origen era solo un color equivocado, pero
en esta plataforma el sistema decide la capa de la simulación quirúrgica, y con
el error el peroneo corto seguía encendido pegado al peroné al apagar la capa de
músculo, como si fuera hueso; en la reducción de una tibia partida, los dos
tibiales salían fundidos con el esqueleto y se veían pegados al hueso. Las
encías son mucosa de la boca y no hueso: el atlas las agrupa con los dientes,
y en la simulación entrarían en la capa de hueso. La corrección se aplica al leer el catálogo, sobre el nombre original de cada
estructura.

La mayoría de las piezas tiene la región deducida: solo 875 (el 39 %) tienen un
concepto FMA que las sitúa; las otras 1.359 (el 61 %) no. No es la excepción de
vasos y nervios: arterias, venas y nervios son 774 de esas 1.359, el 57 %; el
resto es sobre todo músculos (355 de 412) y aparato digestivo (94 de 99). Sirve
igual porque la estimación no se disfraza de dato: cada pieza deducida queda
marcada en el catálogo y el árbol anatómico la señala con un distintivo.

## Límites de este material

- Es **anatomía de referencia de un varón adulto**. No representa la variación
  anatómica ni la anatomía femenina.
- Es material **docente**. No sirve para diagnóstico ni para planificación
  quirúrgica sobre un paciente concreto.

---
Preparación `bp3d-4.0-84768b56` · 2.288.268 triángulos
