// 화면 확인용 저장 파일 만들기: node seed.js <출력경로> <진행 초> <저장 후 지난 분>
import fs from 'node:fs';
import { newState, act, step, newCtx } from '../src/engine/engine';
const [out, secs = '7200', ago = '20'] = process.argv.slice(2);
const s = newState(20261106);
act(s, { type: 'start', name: '카르바노그' });
const ctx = newCtx(true);
let sent = 0;
for (let t = 0; t < Number(secs); t += 0.5) {
  step(s, 0.5, ctx);
  if (Math.floor(t) % 600 === 0 && t % 1 === 0) {
    const d = s.dragons.find((x) => !x.dead && x.home === 0 && !x.mission && x.energy > 40 && x.hp > x.max * 0.5);
    if (d && !s.battle) { act(s, { type: 'hunt', id: d.id, target: sent++ % 3 }); }
  }
}
s.prompt = null;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + '/world.json', JSON.stringify({ format: 'blackflame-desktop-save', savedAt: Date.now() - Number(ago) * 60000, paused: false, state: s }));
console.log('time', s.time, 'dragons', s.dragons.length, 'dead', s.dragons.filter(d=>d.dead).length, 'eggs', s.eggs.length, 'over', s.over);
