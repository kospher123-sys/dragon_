import { describe, it, expect } from 'vitest';
import { SOLO_SKILLS, SOLO_DESC, soloOf, soloTurnStart, soloResolve, soloAttack, soloIncoming, soloAfterHit, soloStatus } from '../src/engine/skillfx';
import { SPECIES_SKILLS } from '../src/engine/skills';
import { newState, act, newCtx, startBattle, battleStep, type Battle, type Dragon } from '../src/engine/engine';

const rnd = (v = 0.5) => () => v;

function setup(species: number, hp = 1) {
  const s = newState(3);
  act(s, { type: 'start', name: '시험' });
  act(s, { type: 'rule', key: 'skills', on: true });
  const d = s.dragons[0];
  d.species = species; d.max = 1000; d.hp = 1000 * hp;
  startBattle(s, newCtx(false), d, 500, '시험장', 'monster', 0);
  const b = s.battle!;
  return { s, d, b };
}
const total = (b: Battle) => b.units.reduce((a, u) => a + u.hp, 0);
const turn = (b: Battle, d: Dragon) => soloTurnStart(b, d, rnd());

describe("'아군 필요' 12개 혼자 판본", () => {
  it('12개 모두 스킬 데이터에 있고 설명·구현 표시가 붙는다', () => {
    const all = SPECIES_SKILLS.flat();
    for (const n of SOLO_SKILLS) {
      const k = all.find((x) => x.name === n);
      expect(k, n).toBeDefined();
      expect(k!.implemented).toBe(true);
      expect(k!.solo).toBe(true);
      expect(k!.effect).toBe(SOLO_DESC[n]);
      expect(k!.slot).not.toBe(2); // 생활 스킬이 아님 (전투 칸)
    }
    expect(all.filter((k) => k.implemented).length).toBe(48); // v1.6: 48개 모두
  });

  it('조건이 안 맞는 궁극기·전투당 횟수를 다 쓴 스킬은 파멸의 발톱으로 바뀐다', () => {
    const { b, d } = setup(1);
    expect(soloResolve(b, d, '가마 소성')).toBe('파멸의 발톱'); // 생명력 100%
    d.hp = 400;
    expect(soloResolve(b, d, '가마 소성')).toBe('가마 소성');
    expect(soloResolve(b, d, '루비 발진')).toBe('파멸의 발톱'); // 펌핑 0
    soloOf(b).uses['용암 동굴'] = 1;
    expect(soloResolve(b, d, '용암 동굴')).toBe('파멸의 발톱');
    expect(soloResolve(b, d, '열 관성')).toBe('열 관성'); // 12개 밖은 그대로
  });

  it('맞불: 큰 공격 −30%, 다음 공격 −15%, 대가로 다음 행동을 쉰다', () => {
    const { b, d } = setup(1);
    turn(b, d);
    soloAttack(b, d, '맞불', 100, false, false, false, rnd());
    expect(soloIncoming(b, d, 100, false, rnd())).toBe(100);
    expect(soloIncoming(b, d, 100, true, rnd())).toBeCloseTo(70);
    expect(soloIncoming(b, d, 100, true, rnd())).toBeCloseTo(85);
    expect(turn(b, d).skip).toBe(true);
    expect(turn(b, d).skip).toBe(false);
  });

  it('가마 소성: 3턴 동안 피해 −30%·회복, 끝나면 소성됨 −10%', () => {
    const { b, d } = setup(1, 0.4);
    turn(b, d);
    soloAttack(b, d, '가마 소성', 100, false, false, false, rnd());
    expect(soloIncoming(b, d, 100, false, rnd())).toBeCloseTo(70);
    for (let i = 0; i < 3; i++) turn(b, d);
    expect(d.hp).toBeCloseTo(400 + 90);
    expect(soloIncoming(b, d, 100, false, rnd())).toBeCloseTo(90);
  });

  it('거품 그물: 겹이 쌓이고 블루의 단일 공격이 다른 적에게 터진다', () => {
    const { b, d } = setup(2);
    soloAttack(b, d, '거품 그물', 100, false, true, false, rnd());
    soloAttack(b, d, '거품 그물', 100, false, true, false, rnd());
    expect(soloOf(b).bubble).toBe(2);
    const before = b.units.map((u) => u.hp);
    soloAttack(b, d, '파멸의 발톱', 100, false, false, false, rnd(0));
    expect(soloOf(b).bubble).toBe(0);
    if (b.units.length > 1) expect(before[1] - b.units[1].hp).toBeCloseTo(20);
  });

  it('발묵: 빗나감 판정', () => {
    const { b, d } = setup(2, 0.3);
    soloAttack(b, d, '발묵', 100, false, true, false, rnd());
    expect(soloIncoming(b, d, 100, false, rnd(0.1))).toBe(0);
    expect(soloIncoming(b, d, 100, false, rnd(0.9))).toBe(100);
  });

  it('접순: 3턴 기생 피해 후 열매로 회복', () => {
    const { b, d } = setup(3, 0.5);
    soloAttack(b, d, '접순', 100, false, false, false, rnd(0));
    const t = total(b);
    for (let i = 0; i < 3; i++) turn(b, d);
    expect(t - total(b)).toBeCloseTo(15);
    expect(d.hp).toBeCloseTo(520);
    expect(soloOf(b).graft).toBeUndefined();
  });

  it('루비 발진: 펌핑이 8이 되어야 쓸 수 있고 쓰면 0', () => {
    const { b, d } = setup(5);
    for (let i = 0; i < 3; i++) soloAttack(b, d, '파멸의 발톱', 10, true, false, false, rnd());
    expect(soloOf(b).pump).toBe(6);
    expect(soloResolve(b, d, '루비 발진')).toBe('파멸의 발톱');
    soloAttack(b, d, '파멸의 발톱', 10, true, false, false, rnd());
    expect(soloOf(b).pump).toBe(8);
    expect(soloResolve(b, d, '루비 발진')).toBe('루비 발진');
    soloAttack(b, d, '루비 발진', 10, false, true, false, rnd());
    expect(soloOf(b).pump).toBe(0);
  });

  it('구전: 3턴 동안 튀고, 자신에게 맞으면 충전이 다음 공격에 쓰인다', () => {
    const { b, d } = setup(11);
    turn(b, d);
    soloAttack(b, d, '구전', 100, false, true, false, rnd());
    soloTurnStart(b, d, rnd(0.1)); // 셋 다 폭풍 자신
    expect(soloOf(b).charge).toBeCloseTo(0.6);
    const r = soloAttack(b, d, '파멸의 발톱', 100, false, false, false, rnd());
    expect(r.dmg).toBeCloseTo(160);
    expect(soloOf(b).charge).toBe(0);
  });

  it('용암 동굴: 2턴 숨어 피해 0, 나오며 분출', () => {
    const { b, d } = setup(7, 0.5);
    turn(b, d);
    soloAttack(b, d, '용암 동굴', 100, false, false, false, rnd());
    expect(soloIncoming(b, d, 100, false, rnd())).toBe(0);
    expect(turn(b, d).skip).toBe(true);
    const t = total(b);
    const r = turn(b, d);
    expect(r.label).toBe('용암 분출');
    expect(t - total(b)).toBeGreaterThan(0);
    expect(soloOf(b).cave).toBeUndefined();
    expect(soloIncoming(b, d, 100, false, rnd())).toBe(100);
  });

  it('능선 박리: 같은 적을 노리며 쌓이고, 범위 공격이 끊는다', () => {
    const { b, d } = setup(8);
    turn(b, d);
    soloAttack(b, d, '능선 박리', 10, false, false, false, rnd(0));
    const k = soloOf(b);
    const u = k.ridge!.unit;
    soloAttack(b, d, '정밀 절제', 10, false, false, false, rnd(0.99));
    expect(k.ridge?.unit).toBe(u);
    expect(k.ridge?.hits).toBe(1);
    soloAttack(b, d, '파멸의 발톱', 10, false, true, false, rnd());
    expect(k.ridge).toBeUndefined();
  });

  it('밀랍 봉개: 25% 넘게 줄면 기록값으로, 쓰러질 피해면 70%로 버틴다', () => {
    const { b, d } = setup(6, 0.8);
    soloAttack(b, d, '밀랍 봉개', 10, false, false, false, rnd());
    d.hp = 500; soloAfterHit(b, d);
    expect(d.hp).toBe(800);
    const b2 = setup(6, 0.8);
    soloAttack(b2.b, b2.d, '밀랍 봉개', 10, false, false, false, rnd());
    b2.d.hp = -5; soloAfterHit(b2.b, b2.d);
    expect(b2.d.hp).toBeCloseTo(560);
  });

  it('금박 펴기: 8% 보호막이 먼저 깎인다', () => {
    const { b, d } = setup(9);
    soloAttack(b, d, '금박 펴기', 10, false, false, false, rnd());
    expect(soloIncoming(b, d, 50, false, rnd())).toBe(0);
    expect(soloIncoming(b, d, 50, false, rnd())).toBeCloseTo(20);
  });

  it('허들 순환: 50% 이하이면 감소가 커진다', () => {
    const { b, d } = setup(10);
    soloAttack(b, d, '허들 순환', 10, false, false, false, rnd());
    expect(soloIncoming(b, d, 100, false, rnd())).toBeCloseTo(90);
    d.hp = 400;
    expect(soloIncoming(b, d, 100, false, rnd())).toBeCloseTo(75);
    expect(soloStatus(b).some((t) => t.startsWith('허들'))).toBe(true);
  });

  it('12종 모두 효과를 켠 채 전투가 정상적으로 끝난다', () => {
    for (let sp = 0; sp < 12; sp++) {
      const { s, d } = setup(sp);
      d.power = 60;
      const ctx = newCtx(false);
      let n = 0;
      for (; s.battle && n < 6000; n++) battleStep(s, ctx, 0.1);
      expect(s.battle, `종족 ${sp}`).toBeNull();
    }
  });
});
