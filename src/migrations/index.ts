import * as migration_20260906_150718_inicial from './20260906_150718_inicial';

export const migrations = [
  {
    up: migration_20260906_150718_inicial.up,
    down: migration_20260906_150718_inicial.down,
    name: '20260906_150718_inicial'
  },
];
