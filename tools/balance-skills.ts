// 종족 고유 스킬 밸런스 (v1.6): 종족별로 같은 전투를 효과 켬(자동 선택·고유 효과·적 쪽 확장) / 끔(v1.4 무작위·효과 없음)으로
// N번씩 돌려 승률·남은 생명력 비교. ENEMY=1 이면 적 쪽 확장만 켠다(스킬은 무작위·효과 없음).
//   npx tsx tools/balance-skills.ts [N=400]
import { newState, act, newCtx, startBattle, battleStep, type State } from '../src/engine/engine';
import { FX } from '../src/engine/skillfx';
import { SPECIES } from '../src/engine/data';

const N = Number(process.argv[2] || 400);
const SPS = (process.env.SP ? process.env.SP.split(',').map(Number) : SPECIES.map((_, i) => i));

function run(sp: number, seed: number, force: number, on: boolean) {
  FX.on = on; FX.enemyOnly = !!process.env.ENEMY;
  const s: State = newState(seed);
  act(s, { type: 'start', name: '시험' });
  act(s, { type: 'rule', key: 'skills', on: true });
  const d = s.dragons[0];
  d.species = sp; d.age = 1e9; d.level = 8; d.injury = 0; d.power = 60; d.max = 900; d.hp = d.max;
  const ctx = newCtx(false);
  startBattle(s, ctx, d, force, '시험장', 'monster', 0);
  for (let n = 0; s.battle && n < 4000; n++) battleStep(s, ctx, 0.1);
  const won = d.hp > 0 && !d.dead && (d.last?.won ?? false);
  return { won, hp: Math.max(0, d.hp) / d.max, dead: !!d.dead };
}

console.log(`종족 · 승률 끔→켬 (차이) · 남은 생명력 끔→켬 · 전사 끔→켬   (N=${N})`);
for (const force of [700, 1000, 1200]) {
  console.log(`-- 적 전력 ${force}`);
  for (const sp of SPS) {
    const r = { off: { w: 0, hp: 0, dead: 0 }, on: { w: 0, hp: 0, dead: 0 } };
    for (let i = 0; i < N; i++) for (const on of [false, true]) {
      const x = run(sp, 1000 + i * 7919, force, on);
      const t = on ? r.on : r.off;
      t.w += +x.won; t.hp += x.hp; t.dead += +x.dead;
    }
    const p = (n: number) => (n / N * 100).toFixed(1);
    const diff = (r.on.w - r.off.w) / N * 100;
    console.log(`${SPECIES[sp].padEnd(4)} ${p(r.off.w)}% → ${p(r.on.w)}% (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%p) · 생명력 ${p(r.off.hp)}% → ${p(r.on.hp)}% · 전사 ${p(r.off.dead)}% → ${p(r.on.dead)}%`);
  }
}
FX.on = true; FX.enemyOnly = false;
