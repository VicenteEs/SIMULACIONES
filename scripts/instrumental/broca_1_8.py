"""
Broca AO de 1,8 mm: túnel del tornillo de 2,4 mm, cortical o bloqueado (D-300).

    blender --background --factory-startup --python scripts/instrumental/broca_1_8.py

Llegó con la placa volar de radio distal 2,4 (`placa_volar_radio_distal_2_4.py`). La tabla de brocas
(`BROCA_DEL_TORNILLO`, src/lib/fijacion.ts) ya pedía 1,8 para los dos tornillos de 2,4, pero la bandeja no tenía con qué
perforarlos: la consola ofrecía la primera broca que encontrara y el aviso de calibre saltaba siempre.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'broca-1-8'
carpeta = iniciar(SLUG)
raiz = fj.broca(SLUG, 'Broca AO 1,8 mm', 1.8, 80.0, 40.0, 'mini', 'Ø 1,8 × 80 mm · túnel del tornillo de 2,4, cortical o bloqueado')
exportar(raiz, SLUG, carpeta)
