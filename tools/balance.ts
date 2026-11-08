import { newState, act, catchUp, guardian } from '../src/engine/engine';
const N = Number(process.argv[2] || 200), hours = Number(process.argv[3] || 8);
let over = 0, raids = 0, falls = 0, deaths = 0, blackAlive = 0, gDead = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const s = newState(1000 + i * 7919);
  act(s, { type: 'start', name: '카르' });
  const g0 = s.dragons[0].id;
  const sum = catchUp(s, hours * 3600);
  if (sum.over) over++;
  raids += sum.raids; falls += sum.falls; deaths += sum.deaths.length;
  blackAlive += s.dragons.filter(d => !d.dead && d.species === 0).length;
  if (s.dragons.find(d => d.id === g0)!.dead) gDead++;
}
console.log(`${hours}h x ${N}: 혈통 종료 ${(over/N*100).toFixed(1)}%, 첫 흑염룡 사망 ${(gDead/N*100).toFixed(1)}%, 평균 습격 ${(raids/N).toFixed(1)}, 함락 ${(falls/N).toFixed(1)}, 사망 ${(deaths/N).toFixed(1)}, 생존 흑염룡 ${(blackAlive/N).toFixed(1)}, ${((Date.now()-t0)/N).toFixed(0)}ms/run`);
