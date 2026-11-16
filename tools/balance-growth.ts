// 테스트판 밸런스: 켜 둔 채(온라인) N시간. 자동 사냥 끔/켬 비교.  npx tsx tools/balance-growth.ts 40 8
import { newState, act, step, newCtx, canTrain, canAwaken, titleOf, type State } from '../src/engine/engine';
import { SOLO } from '../src/engine/skillfx';
// SKILLS=1 이면 종족 고유 스킬 규칙도 켜고, SOLO=0 이면 고유 효과·적 쪽 확장만 끈다(v1.4 방식)
SOLO.on = process.env.SOLO !== '0';
const N = Number(process.argv[2] || 40), hours = Number(process.argv[3] || 8);
function sim(auto: boolean, spend: boolean, rules = false) {
  let over = 0, gDead = 0, res = 0, lv = 0, wins = 0, grade = 0, humans = 0, deaths = 0;
  for (let i = 0; i < N; i++) {
    const s: State = newState(5000 + i * 7919);
    act(s, { type: 'start', name: '카르' });
    if (rules) s.rules = { defense: true, depletion: true, parallel: true, tactics: process.env.TACT !== '0', skills: process.env.SKILLS === '1' };
    const g0 = s.dragons[0].id;
    const ctx = newCtx(false);
    for (let t = 0; t < hours * 3600; t += 0.5) {
      step(s, 0.5, ctx);
      if (t % 60 === 0) {
        for (const d of s.dragons) {
          if (d.dead || d.home !== 0) continue;
          if (auto && d.auto === undefined) act(s, { type: 'auto', id: d.id, region: -1 });
          if (spend) {
            if (!canAwaken(s, d)) act(s, { type: 'awaken', id: d.id });
            for (const st of ['power', 'scale', 'power'] as const) if (!canTrain(s, d, st)) act(s, { type: 'train', id: d.id, stat: st });
          }
        }
      }
      if (s.over) break;
    }
    if (s.over) over++;
    if (s.dragons.find((d) => d.id === g0)!.dead) gDead++;
    const g = s.dragons.find((d) => d.id === g0)!;
    res += s.resources; lv += g.level; wins += g.wins ?? 0; grade += g.grade;
    humans += s.events.filter((e) => e.kind === 'human').length;
    deaths += s.events.filter((e) => e.kind === 'death').length;
    void titleOf;
  }
  console.log(`${rules ? '[실험규칙] ' : ''}자동사냥 ${auto ? '켬' : '끔'} 유물사용 ${spend ? '켬' : '끔'} · ${hours}h x ${N}: 혈통종료 ${(over / N * 100).toFixed(0)}% 첫흑염룡사망 ${(gDead / N * 100).toFixed(0)}% 사망 ${(deaths / N).toFixed(1)} · 첫흑염룡 Lv ${(lv / N).toFixed(1)} 등급 ${(grade / N).toFixed(2)} 승리 ${(wins / N).toFixed(1)} · 남은유물 ${(res / N).toFixed(0)} · 인간방문 ${(humans / N).toFixed(1)}`);
}
sim(false, false);
sim(false, false, true);
sim(true, false);
sim(true, false, true);
sim(true, true);
sim(true, true, true);
