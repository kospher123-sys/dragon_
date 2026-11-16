// v1.6.0 전투 스킬 시스템: 자동 선택, 적 쪽 확장, 나머지 24개 고유 효과, 생활 스킬 보상
import { describe, it, expect } from 'vitest';
import { fxOf, fxPick, fxTurnStart, fxAttack, fxIncoming, fxEnemyAct, fxStatus, envOf, EFFECT_DESC, BIG_MUL, TELEGRAPH, type Env } from '../src/engine/skillfx';
import { SPECIES_SKILLS, skillsOf } from '../src/engine/skills';
import { LIFE_DESC, LIFE_CAP, lifeReward } from '../src/engine/life';
import { newState, act, newCtx, startBattle, battleStep, type Battle, type Dragon, type State } from '../src/engine/engine';

const rnd = (v = 0.5) => () => v;
const env0: Env = { ancestors: 0, brands: [], now: 0 };

function setup(species: number, hp = 1, roles?: string[]) {
  const s = newState(5);
  act(s, { type: 'start', name: '시험' });
  act(s, { type: 'rule', key: 'skills', on: true });
  const d = s.dragons[0];
  d.species = species; d.max = 1000; d.hp = 1000 * hp;
  startBattle(s, newCtx(false), d, 500, '시험장 · 오우거 무리', 'monster', 0);
  const b = s.battle!;
  if (roles) b.units = roles.map((role, i) => ({ role, hp: 200, max: 200, cd: 5 + i }));
  fxOf(b);
  return { s, d, b };
}
const names = (sp: number) => skillsOf(sp).map((k) => k.name);
const total = (b: Battle) => b.units.reduce((a, u) => a + u.hp, 0);
const turn = (b: Battle, d: Dragon) => fxTurnStart(b, d, rnd());

describe('스킬 데이터', () => {
  it('48개 모두 실제 동작 설명이 있다 (전투 36 · 생활 12)', () => {
    for (const k of SPECIES_SKILLS.flat()) {
      expect(k.implemented, k.name).toBe(true);
      expect(k.effect, k.name).toBeTruthy();
      if (k.slot === 2) expect(LIFE_DESC[k.name], k.name).toBeTruthy();
      else expect(EFFECT_DESC[k.name], k.name).toBeTruthy();
    }
    expect(Object.keys(LIFE_DESC).length).toBe(12);
  });
});

describe('자동 선택: 궁극기 > 방어 > 공격 > 파멸의 발톱', () => {
  it('생명력이 높으면 공격, 쿨다운 중이면 파멸의 발톱', () => {
    const { b, d } = setup(7);
    turn(b, d);
    expect(fxPick(b, d, names(7), env0)).toBe('내리막 화쇄류');
    fxAttack(b, d, '내리막 화쇄류', 10, false, false, false, rnd());
    expect(fxPick(b, d, names(7), env0)).toBe('파멸의 발톱');
    for (let i = 0; i < 3; i++) turn(b, d);
    expect(fxPick(b, d, names(7), env0)).toBe('내리막 화쇄류');
  });

  it('조건이 맞으면 방어·궁극기가 먼저', () => {
    const { b, d } = setup(7, 0.55);
    turn(b, d);
    expect(fxPick(b, d, names(7), env0)).toBe('분화 경보'); // 궁극기 70% 이하
    fxAttack(b, d, '분화 경보', 10, false, false, false, rnd());
    expect(fxPick(b, d, names(7), env0)).toBe('용암 동굴'); // 방어 60% 이하
  });

  it('맞불은 적이 큰 공격을 예고할 때만', () => {
    const { b, d } = setup(1, 1, ['용사']);
    turn(b, d);
    expect(fxPick(b, d, names(1), env0)).not.toBe('맞불');
    fxOf(b).e[0].charge = true;
    expect(fxPick(b, d, names(1), env0)).toBe('맞불');
  });

  it('재의 기록은 전사한 선대가 있어야', () => {
    const { b, d } = setup(0, 0.25);
    turn(b, d);
    expect(fxPick(b, d, names(0), env0)).not.toBe('재의 기록');
    expect(fxPick(b, d, names(0), { ...env0, ancestors: 1 })).toBe('재의 기록');
  });
});

describe('적 쪽 확장', () => {
  it('용사는 공격 3번째마다 힘을 모은 뒤 범위 큰 공격', () => {
    const { b } = setup(0, 1, ['용사']);
    const a = fxEnemyAct(b, 0, rnd(0.9));
    expect(a.act).toBe(true);
    fxEnemyAct(b, 0, rnd(0.9));
    const tele = fxEnemyAct(b, 0, rnd(0.9));
    expect(tele.act).toBe(false);
    expect(tele.cd).toBe(TELEGRAPH);
    expect(fxStatus(b)).toContain('⚠ 큰 공격 예고');
    const big = fxEnemyAct(b, 0, rnd(0.9));
    expect(big.big && big.area).toBe(true);
    expect(big.mul).toBeCloseTo(BIG_MUL);
  });

  it('창기사 방진은 드래곤 피해를 줄이고, 궁수는 단일 공격을 피한다', () => {
    const { b, d } = setup(0, 1, ['창기사', '궁수']);
    const m = fxEnemyAct(b, 0, rnd(0.01));
    expect(m.act).toBe(false);
    expect(fxOf(b).e[0].buffs[0]).toMatchObject({ k: 'def', v: 0.25 });
    // 범위 공격: 방진 적은 −25%
    fxAttack(b, d, '파멸의 발톱', 100, false, true, false, rnd(0.9));
    expect(200 - b.units[0].hp).toBeCloseTo(52.5);
    expect(200 - b.units[1].hp).toBeCloseTo(70);
    // 단일 공격이 궁수에게 가고 회피 확률 안이면 0
    const hp = b.units[1].hp;
    fxAttack(b, d, '파멸의 발톱', 100, false, false, false, rnd(0.99 * 0 + 0.6));
    expect(b.units[1].hp).toBeLessThanOrEqual(hp);
  });

  it('마법사 축복은 아군 공격력을 올리고, 범위 공격을 한다', () => {
    const { b } = setup(0, 1, ['마법사', '암살자']);
    const m = fxEnemyAct(b, 0, rnd(0.01));
    expect(m.act).toBe(false);
    expect(fxOf(b).e.some((e) => e.buffs.some((x) => x.k === 'atk'))).toBe(true);
    const n = fxEnemyAct(b, 0, rnd(0.9));
    expect(n.area).toBe(true);
  });
});

describe('나머지 24개 고유 효과', () => {
  it('흑염 낙인: 낙인 찍힌 적과 다시 만나면 ×1.5·사기 −10', () => {
    const { b, d } = setup(0, 1, ['궁수']);
    const sink: { brand?: string } = {};
    const r1 = fxAttack(b, d, '흑염 낙인', 100, false, false, false, rnd(0.9), env0, sink);
    expect(sink.brand).toBe('오우거 무리');
    expect(r1.dmg).toBeCloseTo(120);
    const x = setup(0, 1, ['궁수']);
    x.b.morale = 100;
    const r2 = fxAttack(x.b, x.d, '흑염 낙인', 100, false, false, false, rnd(0.9), { ...env0, brands: ['오우거 무리'] }, {});
    expect(r2.dmg).toBeCloseTo(150);
    expect(x.b.morale).toBe(90);
  });

  it('혈통 인장: 단일 공격 일부를 막는다', () => {
    const { b, d } = setup(0);
    fxAttack(b, d, '혈통 인장', 10, false, false, false, rnd());
    expect(fxIncoming(b, d, 100, false, rnd(0.1), false)).toBe(0);
    expect(fxIncoming(b, d, 100, false, rnd(0.5), false)).toBe(100);
    expect(fxIncoming(b, d, 100, false, rnd(0.1), true)).toBe(100); // 범위는 못 막음
  });

  it('재의 기록: 3턴 동안 그림자가 친다', () => {
    const { b, d } = setup(0, 0.2, ['창기사']);
    fxAttack(b, d, '재의 기록', 100, false, true, false, rnd(0.9));
    const t = total(b);
    turn(b, d);
    expect(t - total(b)).toBeCloseTo(40);
  });

  it('열 관성: 열만큼 배율', () => {
    const { b, d } = setup(1, 1, ['창기사']);
    const r = fxAttack(b, d, '열 관성', 100, false, false, false, rnd(0.9), env0, { heat: 5 });
    expect(r.dmg).toBeCloseTo(110);
  });

  it('열 관성: 엔진에서 행동할 때마다 쌓이고 시간이 지나면 식는다', () => {
    const { s, d } = setup(1);
    const ctx = newCtx(false);
    for (let n = 0; s.battle && n < 400; n++) battleStep(s, ctx, 0.1);
    expect(d.heat?.n).toBeGreaterThan(0);
  });

  it('물그림자: 단일 공격 1번을 대신 맞는다', () => {
    const { b, d } = setup(2);
    fxAttack(b, d, '물그림자', 10, false, false, false, rnd());
    expect(fxIncoming(b, d, 100, false, rnd(0.9))).toBe(0);
    expect(fxIncoming(b, d, 100, false, rnd(0.9))).toBe(100);
  });

  it('덩굴 울타리: 자란 단계만큼 보호막', () => {
    const { b, d } = setup(3, 0.7);
    const sink: { vineAt?: number } = {};
    fxAttack(b, d, '덩굴 울타리', 10, false, false, false, rnd(), { ...env0, now: 10000, vineAt: 0 }, sink);
    expect(fxOf(b).shield).toBeCloseTo(1000 * (0.04 + 0.03 * 2));
    expect(sink.vineAt).toBe(10000);
  });

  it('휘묻이 숲: 턴마다 적 전체 피해와 행동 지연', () => {
    const { b, d } = setup(3, 0.3, ['창기사', '궁수']);
    fxAttack(b, d, '휘묻이 숲', 100, false, true, false, rnd(0.9));
    const t = total(b), cd = b.units.reduce((a, u) => a + u.cd, 0);
    turn(b, d);
    expect(t - total(b)).toBeCloseTo(20);
    expect(b.units.reduce((a, u) => a + u.cd, 0)).toBeCloseTo(cd + 1.5);
  });

  it('회전 등명: 순서대로 비추고 비춰진 적은 회피 불가', () => {
    const { b, d } = setup(4, 1, ['궁수', '암살자']);
    fxAttack(b, d, '회전 등명', 100, false, false, false, rnd(0.01));
    expect(200 - b.units[0].hp).toBeCloseTo(60); // 시전 ×0.6, 회피 무효
    turn(b, d);
    expect(200 - b.units[1].hp).toBeCloseTo(20); // 다음 순서 암살자 섬광 2번
  });

  it('안개 막: 빗나가면 공격한 적이 드러나 다음 공격 ×1.2', () => {
    const { b, d } = setup(4, 1, ['창기사', '마법사']);
    fxAttack(b, d, '안개 막', 10, false, false, false, rnd());
    expect(fxIncoming(b, d, 100, false, rnd(0.1), false, 1)).toBe(0);
    const r = fxAttack(b, d, '파멸의 발톱', 100, false, false, false, rnd(0.9));
    expect(r.dmg).toBeCloseTo(120);
    expect(200 - b.units[1].hp).toBeCloseTo(125); // 시전 공격 5 + 드러난 적 ×1.2
  });

  it('브로켄 강림: 다른 스킬을 쓴 뒤·4번째 행동부터', () => {
    const { b, d } = setup(4);
    for (let i = 0; i < 3; i++) turn(b, d);
    expect(fxPick(b, d, names(4), env0)).not.toBe('브로켄 강림');
    fxAttack(b, d, '회전 등명', 10, false, false, false, rnd());
    expect(fxPick(b, d, names(4), env0)).toBe('브로켄 강림');
    fxAttack(b, d, '브로켄 강림', 10, false, false, false, rnd());
    expect(fxIncoming(b, d, 100, false, rnd())).toBeCloseTo(90);
  });

  it('성채: 맞을 때마다 결정, 3개면 범위', () => {
    const { b, d } = setup(5);
    for (let i = 0; i < 3; i++) fxIncoming(b, d, 10, false, rnd(0.9));
    expect(fxOf(b).crystals).toBe(3);
    expect(fxPick(b, d, names(5), env0)).toBe('성채');
  });

  it('패싯 전반사: 같은 적의 두 번째 공격부터 줄고 되튕긴다', () => {
    const { b, d } = setup(5, 1, ['창기사']);
    fxAttack(b, d, '패싯 전반사', 0, false, false, false, rnd());
    expect(fxIncoming(b, d, 100, false, rnd(0.9), false, 0)).toBe(100);
    expect(fxIncoming(b, d, 100, false, rnd(0.9), false, 0)).toBeCloseTo(90);
    expect(b.units[0].hp).toBeCloseTo(200 - 9);
  });

  it('호박 봉입: 가둔 적은 행동하지 않고, 모인 피해 ×1.2', () => {
    const { b, d } = setup(6, 1, ['창기사']);
    fxAttack(b, d, '호박 봉입', 100, false, false, false, rnd(0));
    expect(b.units[0].hp).toBe(200);
    expect(fxEnemyAct(b, 0, rnd(0.9)).act).toBe(false);
    turn(b, d); turn(b, d);
    expect(b.units[0].hp).toBeCloseTo(200 - 120);
    expect(fxOf(b).swarmReady).toBe(true); // 120 ≥ 최대 생명력 50%
  });

  it('분봉: 범위 공격에 무리가 흩어지고 끝날 때 남은 무리만큼 회복', () => {
    const { b, d } = setup(6, 0.5);
    fxOf(b).swarmReady = true;
    fxAttack(b, d, '분봉', 100, false, false, false, rnd());
    fxIncoming(b, d, 10, false, rnd(0.9), true);
    for (let i = 0; i < 3; i++) turn(b, d);
    expect(d.hp).toBeCloseTo(500 + 60); // 남은 2무리 × 3% (받은 피해는 엔진이 뺀다)
  });

  it('내리막 화쇄류: 비율이 더 낮은 적으로만 흐른다', () => {
    const { b, d } = setup(7, 1, ['창기사', '궁수', '마법사']);
    b.units[0].hp = 200; b.units[1].hp = 100; b.units[2].hp = 150;
    fxAttack(b, d, '내리막 화쇄류', 100, false, false, false, rnd());
    expect(b.units[0].hp).toBeCloseTo(150);
    expect(b.units[2].hp).toBeCloseTo(115);
    expect(b.units[1].hp).toBeCloseTo(75.5); // ×0.5 → 0.35 → 0.245
  });

  it('분화 경보: 4턴 단계 뒤 대분화, 크게 맞으면 정체', () => {
    const { b, d } = setup(7, 0.6, ['창기사']);
    fxAttack(b, d, '분화 경보', 100, false, false, false, rnd());
    turn(b, d); turn(b, d);
    expect(fxOf(b).exposed).toBe(true);
    fxIncoming(b, d, 300, false, rnd(0.9));
    turn(b, d);
    expect(fxOf(b).alarm?.stage).toBe(2); // 정체
    turn(b, d); turn(b, d);
    expect(fxOf(b).alarm).toBeUndefined();
  });

  it('정밀 절제: 버프 최대 2개를 잘라 내고 개수당 추가 피해', () => {
    const { b, d } = setup(8, 1, ['창기사']);
    fxOf(b).e[0].buffs = [{ k: 'def', v: 0.25, n: 3 }, { k: 'atk', v: 0.2, n: 3 }, { k: 'atk', v: 0.2, n: 2 }];
    expect(fxPick(b, d, names(8), env0)).toBe('능선 박리'); // 궁극기가 먼저
    fxOf(b).ridge = { unit: 0, until: 99, hits: 0 }; fxOf(b).ready['능선 박리'] = 99;
    fxOf(b).ridge = undefined;
    expect(fxPick(b, d, names(8), env0)).toBe('정밀 절제');
    const r = fxAttack(b, d, '정밀 절제', 100, false, false, false, rnd(0.9));
    expect(fxOf(b).e[0].buffs.length).toBe(1);
    expect(r.dmg).toBeCloseTo(170);
  });

  it('루퍼트의 눈물: 단일은 줄고, 범위를 맞으면 깨지며 파편', () => {
    const { b, d } = setup(8, 0.8, ['창기사']);
    fxAttack(b, d, '루퍼트의 눈물', 100, false, false, false, rnd(0.9));
    expect(fxIncoming(b, d, 100, false, rnd(0.9), false)).toBeCloseTo(85);
    const hp = b.units[0].hp;
    expect(fxIncoming(b, d, 100, false, rnd(0.9), true)).toBeCloseTo(130);
    expect(b.units[0].hp).toBeLessThan(hp);
    expect(fxOf(b).skip).toBe(1);
  });

  it('금화 대출: 빌려준 적의 공격을 장부에 적고 만기에 상환', () => {
    const { b, d } = setup(9, 0.5, ['궁수', '창기사']);
    fxAttack(b, d, '금화 대출', 100, false, false, false, rnd(0.9));
    const L = fxOf(b).loan!;
    expect(b.units[L.unit].role).toBe('궁수');
    fxIncoming(b, d, 50, false, rnd(0.9), false, L.unit);
    expect(fxOf(b).loan!.ledger).toBe(50);
    const hp = b.units[L.unit].hp;
    turn(b, d); turn(b, d);
    expect(hp - b.units[L.unit].hp).toBeCloseTo(50 * 1.2 + 80);
  });

  it('내림 경매: 값이 내려가 10% 이하면 낙찰', () => {
    const { b, d } = setup(9, 1, ['창기사']);
    fxAttack(b, d, '내림 경매', 100, false, false, false, rnd(0.9));
    turn(b, d); turn(b, d);
    expect(fxOf(b).auction?.price).toBeCloseTo(0.1);
    const r = turn(b, d);
    expect(r.label).toBe('왕관 낙찰');
    expect(d.hp).toBeCloseTo(900);
    expect(fxIncoming(b, d, 100, false, rnd(0.9))).toBeCloseTo(80);
  });

  it('눈사태 유도: 3턴 쉬면 단일 ×1.4, 4턴이면 범위 ×1.5', () => {
    const { b, d } = setup(10, 1, ['창기사', '궁수']);
    for (let i = 0; i < 3; i++) turn(b, d);
    expect(fxPick(b, d, names(10), env0)).toBe('눈사태 유도');
    const r = fxAttack(b, d, '눈사태 유도', 100, false, false, false, rnd(0.01));
    expect(r.dmg).toBeCloseTo(140);
    for (let i = 0; i < 4; i++) turn(b, d);
    const r2 = fxAttack(b, d, '눈사태 유도', 100, false, false, false, rnd(0.9));
    expect(r2.dmg).toBeCloseTo(150);
  });

  it('얼어붙은 시간: 행동하지 않고, 적이 3번 행동하면 얼어붙는다', () => {
    const { b, d } = setup(10, 0.5, ['창기사']);
    fxAttack(b, d, '얼어붙은 시간', 100, false, false, false, rnd());
    expect(turn(b, d).skip).toBe(true);
    for (let i = 0; i < 3; i++) fxEnemyAct(b, 0, rnd(0.9));
    expect(fxEnemyAct(b, 0, rnd(0.9)).act).toBe(false);
    expect(fxIncoming(b, d, 100, false, rnd(0.9))).toBeCloseTo(50);
  });

  it('선행 방전: 공격력 가장 높은 적을 노리고 약화', () => {
    const { b, d } = setup(11, 1, ['궁수', '용사']);
    fxAttack(b, d, '선행 방전', 100, false, false, false, rnd(0.9));
    expect(200 - b.units[1].hp).toBeCloseTo(105);
    expect(fxOf(b).e[1].weak).toBe(2);
  });

  it('회로 차단기: 30% 넘는 피해를 자르고 다음 행동을 쉰다', () => {
    const { b, d } = setup(11, 0.85);
    fxAttack(b, d, '회로 차단기', 10, false, false, false, rnd());
    expect(fxIncoming(b, d, 500, true, rnd(0.9))).toBeCloseTo(300);
    expect(fxOf(b).breaker).toBe(2);
    expect(turn(b, d).skip).toBe(true);
  });
});

describe('엔진 통합', () => {
  it('효과를 켠 전투에서 고유 스킬들이 실제로 쓰이고 전투가 끝난다', () => {
    for (let sp = 0; sp < 12; sp++) {
      const { s, d } = setup(sp);
      d.power = 60; d.max = 900; d.hp = 900;
      const ctx = newCtx(false);
      const seen = new Set<string>();
      for (let n = 0; s.battle && n < 6000; n++) { battleStep(s, ctx, 0.1); if (s.battle) seen.add(s.battle.skill.split(' · ')[0]); }
      expect(s.battle, `종족 ${sp}`).toBeNull();
      expect(seen.has(names(sp)[0]) || seen.has(names(sp)[1]) || seen.has(names(sp)[3]), `종족 ${sp} 고유 스킬 사용`).toBe(true);
    }
  });

  it('흑염 낙인은 전투 뒤에도 낙인을 기억한다', () => {
    const { s, d } = setup(0);
    d.power = 60;
    const ctx = newCtx(false);
    for (let n = 0; s.battle && n < 6000; n++) battleStep(s, ctx, 0.1);
    expect(s.brands).toContain('오우거 무리');
    expect(envOf(s).brands).toContain('오우거 무리');
  });
});

describe('흑염 낙인 바탕화면 연동', () => {
  it('조종 모드로 쫓아낸 몬스터 이름이 낙인 목록에 들어간다 (사냥터 몬스터만)', () => {
    const s = newState(9);
    act(s, { type: 'start', name: '시험' });
    act(s, { type: 'rule', key: 'skills', on: true });
    expect(act(s, { type: 'brand', name: '고블린' })).toBeNull();
    expect(act(s, { type: 'brand', name: '없는몬스터' })).toBeTruthy();
    expect(s.brands).toEqual(['고블린']);
  });
});

describe('생활 스킬 보상', () => {
  function life(): State {
    const s = newState(9);
    act(s, { type: 'start', name: '시험' });
    act(s, { type: 'rule', key: 'skills', on: true });
    return s;
  }
  it('규칙이 꺼져 있으면 받지 않는다', () => {
    const s = newState(9);
    act(s, { type: 'start', name: '시험' });
    act(s, { type: 'rule', key: 'skills', on: false });
    expect(act(s, { type: 'life', key: 'shell' })).toBeTruthy();
  });
  it('하루 한도', () => {
    const s = life();
    const r0 = s.resources;
    for (let i = 0; i < LIFE_CAP.shell; i++) expect(act(s, { type: 'life', key: 'shell' })).toBeNull();
    expect(act(s, { type: 'life', key: 'shell' })).toBe('오늘 몫은 다 받았습니다');
    expect(s.resources).toBe(r0 + LIFE_CAP.shell);
    s.time += 24 * 3600;
    expect(act(s, { type: 'life', key: 'shell' })).toBeNull();
  });
  it('잿불 묻기: 레어 드래곤 기력', () => {
    const s = life();
    const d = s.dragons[0]; d.energy = 50;
    expect(lifeReward(s, 'ember', d.id, 3)).toBeNull();
    expect(d.energy).toBe(65);
  });
  it('8자 춤·사금: 다음 사냥 승리 유물 보너스', () => {
    const s = life();
    act(s, { type: 'life', key: 'dance' });
    act(s, { type: 'life', key: 'gold' });
    expect(s.life?.loot).toBeCloseTo(0.15);
  });
  it('정밀 봉합: 부상 −25%, 다음 전투 첫 피격 −15%', () => {
    const s = life();
    const d = s.dragons[0]; d.injury = 4;
    expect(act(s, { type: 'life', key: 'suture', id: d.id })).toBeNull();
    expect(d.injury).toBeCloseTo(3);
    startBattle(s, newCtx(false), d, 300, '시험장', 'monster', 0);
    const b = s.battle!;
    expect(fxIncoming(b, d, 100, false, rnd(0.9))).toBeCloseTo(85);
    expect(fxIncoming(b, d, 100, false, rnd(0.9))).toBe(100);
  });
  it('눈송이 도감·간헐천 연속', () => {
    const s = life();
    s.dragons[0].species = 10;
    expect(act(s, { type: 'life', key: 'snow', n: 5 })).toBeNull();
    expect(s.life?.snow).toBe(1 << 5);
    for (let i = 0; i < 2; i++) act(s, { type: 'life', key: 'geyser' });
    act(s, { type: 'life', key: 'geyser', miss: true });
    expect(s.life?.geyser).toBe(0);
  });
  it('종족 드래곤이 없으면 받지 않는다', () => {
    const s = life();
    expect(act(s, { type: 'life', key: 'flash', n: 2 })).toBe('폭풍이 없습니다');
  });
});
