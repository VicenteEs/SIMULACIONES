import * as migration_20260906_150718_inicial from './20260906_150718_inicial';
import * as migration_20260909_231143_atlas from './20260909_231143_atlas';
import * as migration_20260910_125744_catalogos_del_simulador from './20260910_125744_catalogos_del_simulador';
import * as migration_20260910_125801_caso_quirurgico from './20260910_125801_caso_quirurgico';
import * as migration_20260910_132203_tolerancia_diastasis from './20260910_132203_tolerancia_diastasis';
import * as migration_20260912_212708_bandeja_y_modelo_de_instrumento from './20260912_212708_bandeja_y_modelo_de_instrumento';
import * as migration_20260913_033442_actividad_una_fila_por_ficha from './20260913_033442_actividad_una_fila_por_ficha';
import * as migration_20260913_041920_objetivo_de_los_pasos_antiguos from './20260913_041920_objetivo_de_los_pasos_antiguos';
import * as migration_20260913_043401_ultimo_administrador_activo from './20260913_043401_ultimo_administrador_activo';

export const migrations = [
  {
    up: migration_20260906_150718_inicial.up,
    down: migration_20260906_150718_inicial.down,
    name: '20260906_150718_inicial',
  },
  {
    up: migration_20260909_231143_atlas.up,
    down: migration_20260909_231143_atlas.down,
    name: '20260909_231143_atlas',
  },
  {
    up: migration_20260910_125744_catalogos_del_simulador.up,
    down: migration_20260910_125744_catalogos_del_simulador.down,
    name: '20260910_125744_catalogos_del_simulador',
  },
  {
    up: migration_20260910_125801_caso_quirurgico.up,
    down: migration_20260910_125801_caso_quirurgico.down,
    name: '20260910_125801_caso_quirurgico',
  },
  {
    up: migration_20260910_132203_tolerancia_diastasis.up,
    down: migration_20260910_132203_tolerancia_diastasis.down,
    name: '20260910_132203_tolerancia_diastasis',
  },
  {
    up: migration_20260912_212708_bandeja_y_modelo_de_instrumento.up,
    down: migration_20260912_212708_bandeja_y_modelo_de_instrumento.down,
    name: '20260912_212708_bandeja_y_modelo_de_instrumento',
  },
  {
    up: migration_20260913_033442_actividad_una_fila_por_ficha.up,
    down: migration_20260913_033442_actividad_una_fila_por_ficha.down,
    name: '20260913_033442_actividad_una_fila_por_ficha',
  },
  {
    up: migration_20260913_041920_objetivo_de_los_pasos_antiguos.up,
    down: migration_20260913_041920_objetivo_de_los_pasos_antiguos.down,
    name: '20260913_041920_objetivo_de_los_pasos_antiguos',
  },
  {
    up: migration_20260913_043401_ultimo_administrador_activo.up,
    down: migration_20260913_043401_ultimo_administrador_activo.down,
    name: '20260913_043401_ultimo_administrador_activo'
  },
];
