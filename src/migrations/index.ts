import * as migration_20260906_150718_inicial from './20260906_150718_inicial';
import * as migration_20260909_231143_atlas from './20260909_231143_atlas';
import * as migration_20260910_125744_catalogos_del_simulador from './20260910_125744_catalogos_del_simulador';
import * as migration_20260910_125801_caso_quirurgico from './20260910_125801_caso_quirurgico';
import * as migration_20260910_132203_tolerancia_diastasis from './20260910_132203_tolerancia_diastasis';

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
    name: '20260910_132203_tolerancia_diastasis'
  },
];
