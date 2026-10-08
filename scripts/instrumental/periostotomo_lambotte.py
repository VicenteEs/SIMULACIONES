"""
Periostótomo AO/Lambotte, 200 mm: hoja plana de 14 mm con filo, vástago y mango de acero
moleteado. Despega el periostio del hueso con un mínimo de daño a su irrigación.

    blender --background --factory-startup --python scripts/instrumental/periostotomo_lambotte.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import exposicion as ex

SLUG = 'periostotomo-lambotte'
carpeta = iniciar(SLUG)
raiz = ex.periostotomo(SLUG, 'Periostótomo AO / Lambotte 14 mm', 14.0, 200.0, False, 'Largo 200 mm · hoja plana de 14 mm (también de 6 mm en pequeño fragmento)')
exportar(raiz, SLUG, carpeta)
