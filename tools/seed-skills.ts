// 화면 확인용(v1.6 스킬): npx tsx tools/seed-skills.ts <폴더> → BLACKFLAME_DATA=<폴더> 로 실행. 종족 고유 스킬 규칙 켬, 레어에 여러 종족 새끼, 결투 진행 중
import fs from 'node:fs';
import { newState, act, startBattle, newCtx, step } from '../src/engine/engine';
const out = process.argv[2];
const s = newState(20261109);
act(s, { type: 'start', name: '카르바노그' });
act(s, { type: 'rule', key: 'skills', on: true });
act(s, { type: 'rule', key: 'tactics', on: true });
const base = s.dragons[0];
base.age = 1e6; base.matured = true; base.level = 9; base.power = 70; base.max = 6000; base.hp = 6000;
for (const sp of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
  s.dragons.push({ ...base, id: 'k' + sp, name: `${['','레드','블루','에메랄드','백은','루비','호박','화산','흑요석','황금','서리','폭풍'][sp]} · 새끼`, species: sp, age: 600, matured: false, level: 3, generation: 2, injury: sp === 3 ? 6 : 0, hp: 300, max: 400, power: 30 });
}
const ctx = newCtx(false);
for (let i = 0; i < 20; i++) step(s, 0.5, ctx);
startBattle(s, ctx, base, 600, '레어 앞 · 떠돌이 기사단', 'duel', 0);
s.battle!.roles = ['용사', '창기사', '궁수', '마법사', '암살자'];
s.battle!.units = s.battle!.roles.map((role, i) => ({ role, hp: 4000, max: 4000, cd: 1 + i * 0.4 }));
s.prompt = null;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + '/world.json', JSON.stringify({ format: 'blackflame-desktop-save', savedAt: Date.now(), paused: false, state: s }));
console.log('ok', s.dragons.length);
