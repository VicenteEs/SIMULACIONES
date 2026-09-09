import * as migration_20260906_150718_inicial from './20260906_150718_inicial';
import * as migration_20260909_231143_atlas from './20260909_231143_atlas';

export const migrations = [
  {
    up: migration_20260906_150718_inicial.up,
    down: migration_20260906_150718_inicial.down,
    name: '20260906_150718_inicial',
  },
  {
    up: migration_20260909_231143_atlas.up,
    down: migration_20260909_231143_atlas.down,
    name: '20260909_231143_atlas'
  },
];
