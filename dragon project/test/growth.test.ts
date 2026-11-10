import { describe, it, expect } from 'vitest';
import {
  newState, act, step, newCtx, canTrain, canAwaken, trainCost, awakenLevel, travelTime, titleOf,
} from '../src/engine/engine';
import { T, GRADE_MULT } from '../src/engine/data';

const run = (s: ReturnType<typeof newState>, seconds: number) => {
  const ctx = newCtx();
  for (let t = 0; t < seconds; t += 0.5) step(s, 0.5, ctx);
  return ctx;
};
const started = (seed: number) => {
  const s = newState(seed);
  act(s, { type: 'start', name: '카르' });
  s.nextEvent = 1e9;
  s.nextHuman = 1e9;
  return s;
};

describe('성장 콘텐츠 (테스트판)', () => {
  it('수련은 유물을 쓰고 레벨당 1회까지', () => {
    const s = started(3);
    const d = s.dragons[0];
    s.resources = 1000;
    expect(d.level).toBe(3);
    const p = d.power, m = d.max;
    expect(act(s, { type: 'train', id: d.id, stat: 'power' })).toBeNull();
    expect(d.power).toBe(p + 6);
    expect(act(s, { type: 'train', id: d.id, stat: 'scale' })).toBeNull();
    expect(d.max).toBe(m + 40);
    expect(act(s, { type: 'train', id: d.id, stat: 'wing' })).toBeNull();
    expect(travelTime(d)).toBeCloseTo(T.TRAVEL * 0.94);
    expect(canTrain(s, d, 'power')).toMatch(/슬롯/);
    expect(s.resources).toBe(1000 - 20 - 32 - 44);
    expect(trainCost(d)).toBe(56);
  });

  it('유물이 모자라면 수련할 수 없다', () => {
    const s = started(4);
    s.resources = 5;
    expect(act(s, { type: 'train', id: s.dragons[0].id, stat: 'power' })).toMatch(/유물/);
  });

  it('각성은 레벨 조건을 채우면 등급을 올리고 능력치를 등급 배율만큼 키운다', () => {
    const s = started(5);
    const d = s.dragons[0];
    d.grade = 1;
    s.resources = 1000;
    expect(canAwaken(s, d)).toMatch(/Lv\.10/);
    d.level = awakenLevel(d);
    const p = d.power;
    expect(act(s, { type: 'awaken', id: d.id })).toBeNull();
    expect(d.grade).toBe(2);
    expect(d.power).toBe(Math.round(p * GRADE_MULT[2] / GRADE_MULT[1]));
    d.grade = 3;
    d.level = 50;
    expect(canAwaken(s, d)).toMatch(/군주/);
  });

  it('자동 사냥은 레어에 지킴이 성체가 없으면 나가지 않는다', () => {
    const s = started(7);
    const d = s.dragons[0];
    act(s, { type: 'auto', id: d.id, region: 0 });
    run(s, 1);
    expect(d.mission).toBeUndefined(); // 처음엔 내 레어에 흑염룡 1마리뿐
  });

  it('자동 사냥은 회복되면 스스로 출발하고, 끄면 멈춘다', () => {
    const s = started(6);
    const d = s.dragons[0];
    // 지킴이 성체 한 마리를 레어에 둔다
    s.dragons.push({ ...structuredClone(d), id: 'keeper', name: '지킴이' });
    expect(act(s, { type: 'auto', id: d.id, region: 0 })).toBeNull();
    run(s, 1);
    expect(d.mission?.kind).toBe('hunt');
    expect(d.mission?.target).toBe(0);
    // 전투·귀환을 끝까지 돌려도 다시 나간다
    let departs = 0;
    for (let i = 0; i < 20000 && departs < 2; i++) {
      const was = d.mission?.kind;
      run(s, 1);
      if (was !== 'hunt' && d.mission?.kind === 'hunt') departs++;
      if (d.dead) break;
    }
    expect(departs).toBeGreaterThan(0);
    act(s, { type: 'auto', id: d.id, region: null });
    expect(d.auto).toBeUndefined();
  });

  it('알아서 모드는 감당할 만한 지역만 고른다', () => {
    const s = started(8);
    const d = s.dragons[0];
    s.dragons.push({ ...structuredClone(d), id: 'keeper', name: '지킴이' });
    act(s, { type: 'auto', id: d.id, region: -1 });
    for (let i = 0; i < 30; i++) {
      d.mission = undefined;
      d.energy = 100;
      d.hp = d.max;
      run(s, 0.5);
      expect((d.mission as { target?: number } | undefined)?.target).toBe(0);
    }
  });

  it('인간 방문은 기록과 바탕화면 연출 소식을 남긴다', () => {
    const s = started(10);
    s.nextHuman = s.time + 1;
    const kinds = new Set<string>();
    for (let i = 0; i < 40; i++) {
      s.nextHuman = s.time + 0.5;
      s.battle = null;
      const ctx = run(s, 1);
      for (const n of ctx.notices) if (n.kind === 'human') kinds.add(n.human!);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });

  it('승리 횟수에 따라 칭호가 붙는다', () => {
    const s = started(12);
    const d = s.dragons[0];
    expect(titleOf(d)).toBeNull();
    d.wins = 5;
    expect(titleOf(d)).toBe('사냥꾼');
    d.wins = 61;
    expect(titleOf(d)).toBe('전설의 포식자');
  });

  it('업적은 조건을 채우면 한 번만 달성되고 유물을 준다', () => {
    const s = started(14);
    run(s, 11);
    expect(s.achievements).toEqual([]);
    s.stats = { raidWins: 0, duelWins: 0, tributes: 0, ruins: 1, huntWins: 1 };
    const r = s.resources;
    run(s, 11);
    expect(s.achievements).toEqual(expect.arrayContaining(['hunt1', 'ruin1']));
    expect(s.resources).toBeGreaterThanOrEqual(r + 100);
    const n = s.achievements!.length;
    run(s, 30);
    expect(s.achievements!.length).toBe(n);
  });

  it('둥지 장식은 유물로 한 번씩 들이고, 쓰다듬기는 간격이 있다', () => {
    const s = started(15);
    s.resources = 100;
    expect(act(s, { type: 'decor', item: 'crystal' })).toMatch(/유물/);
    expect(act(s, { type: 'decor', item: 'torch' })).toBeNull();
    expect(act(s, { type: 'decor', item: 'torch' })).toMatch(/이미/);
    expect(s.resources).toBe(20);
    const d = s.dragons[0];
    d.energy = 50;
    expect(act(s, { type: 'pet', id: d.id })).toBeNull();
    expect(d.energy).toBe(58);
    expect(act(s, { type: 'pet', id: d.id })).toMatch(/방금/);
    run(s, 601);
    expect(act(s, { type: 'pet', id: d.id })).toBeNull();
  });

  it('바탕화면 몬스터 퇴치 보상은 게임 하루 20번까지', () => {
    const s = started(16);
    s.resources = 0;
    for (let i = 0; i < 25; i++) act(s, { type: 'bounty' });
    expect(s.resources).toBe(20);
    run(s, T.DAY);
    expect(act(s, { type: 'bounty' })).toBeNull();
  });

  it('연패한 드래곤은 완전히 회복할 때까지 자동 사냥을 쉰다', () => {
    const s = started(17);
    const d = s.dragons[0];
    s.dragons.push({ ...structuredClone(d), id: 'keeper', name: '지킴이' });
    act(s, { type: 'auto', id: d.id, region: 0 });
    d.streak = 3;
    d.hp = d.max * 0.8;
    run(s, 1);
    expect(d.mission).toBeUndefined();
    d.hp = d.max; d.injury = 0; d.energy = 100;
    run(s, 1);
    expect(d.mission?.kind).toBe('hunt');
  });

  it('사냥터 고갈: 이길수록 유물이 줄고 시간이 지나면 회복된다', () => {
    const s = started(18);
    act(s, { type: 'rule', key: 'depletion', on: true });
    s.yields = [1, 1, 1, 1, 1, 1];
    s.yields[0] = 0.4;
    run(s, 1800);
    expect(s.yields[0]).toBeCloseTo(0.9, 1);
    run(s, 1800);
    expect(s.yields[0]).toBe(1);
  });

  it('동시 사냥: 다른 전투 중에도 도착한 사냥은 바로 결과가 난다', () => {
    const s = started(19);
    act(s, { type: 'rule', key: 'parallel', on: true });
    const d = s.dragons[0];
    s.dragons.push({ ...structuredClone(d), id: 'raider', name: '수비' });
    act(s, { type: 'hunt', id: d.id, target: 0 });
    // 다른 드래곤이 오래 걸리는 전투 중
    s.battle = { dragon: 'raider', roles: ['용사'], force: 1e6, count: 1, hp: 1e9, max: 1e9, place: '테스트', kind: 'raid', target: 0, units: [{ role: '용사', hp: 1e9, max: 1e9, cd: 1e9 }], t: 0, dc: 1e9, hc: 0, skill: '', log: [], phase: 0 };
    run(s, T.TRAVEL + 2);
    expect(s.battle?.dragon).toBe('raider'); // 화면 전투는 그대로
    expect(d.mission?.kind).toBe('return'); // 사냥은 끝나고 귀환 중
  });

  it('숙적: 결투에서 진 도전자가 숙적이 되고, 세 번 지면 떠난다', () => {
    const s = started(20);
    s.nemesis = { name: '카엘', level: 1, defeats: 2, wins: 0 };
    const r = s.resources;
    // 숙적 결투에서 이긴 상황을 흉내
    const d = s.dragons[0];
    s.battle = { dragon: d.id, roles: ['용사'], force: 1, count: 1, hp: 0, max: 1, place: '황혼의 레어 앞 · 숙적 카엘', kind: 'duel', target: 0, units: [{ role: '용사', hp: 0, max: 1, cd: 9 }], t: 0, dc: 9, hc: 0, skill: '', log: [], phase: 0 };
    run(s, 0.5);
    expect(s.battle).toBeNull();
    expect(s.nemesis).toBeUndefined();
    expect(s.resources).toBeGreaterThanOrEqual(r + 150);
  });

  it('전술 전투: 사기가 무너지면 적이 달아나고, 명령에는 대기 시간이 있다', () => {
    const s = started(21);
    act(s, { type: 'rule', key: 'tactics', on: true });
    const d = s.dragons[0];
    act(s, { type: 'hunt', id: d.id, target: 0 });
    run(s, T.TRAVEL + 1);
    const b = s.battle!;
    expect(b.morale).toBe(100);
    expect(act(s, { type: 'command', order: 'roar' })).toBeNull();
    expect(b.morale).toBeLessThan(100);
    expect(act(s, { type: 'command', order: 'focus' })).toMatch(/초 뒤/);
    b.morale = 0;
    run(s, 0.5);
    expect(s.battle).toBeNull();
    expect(d.wins).toBe(1);
  });

  it('전술 전투: 후퇴 명령은 목숨을 지키고 귀환한다', () => {
    const s = started(22);
    act(s, { type: 'rule', key: 'tactics', on: true });
    const d = s.dragons[0];
    act(s, { type: 'hunt', id: d.id, target: 0 });
    run(s, T.TRAVEL + 1);
    expect(act(s, { type: 'command', order: 'retreat' })).toBeNull();
    expect(s.battle).toBeNull();
    expect(d.dead).toBeFalsy();
    expect(d.mission?.kind).toBe('return');
  });

  it('바탕화면 방어전: 습격 중 침입자를 막으면 적 전력이 깎이고 15번까지', () => {
    const s = started(23);
    expect(act(s, { type: 'defend' })).toMatch(/습격/);
    const d = s.dragons[0];
    s.battle = { dragon: d.id, roles: ['용사'], force: 500, count: 500, hp: 1000, max: 1000, place: '황혼의 레어', kind: 'raid', target: 0, units: [{ role: '용사', hp: 1000, max: 1000, cd: 9 }], t: 0, dc: 9, hc: 0, skill: '', log: [], phase: 0 };
    expect(act(s, { type: 'defend' })).toBeNull();
    expect(s.battle.hp).toBe(965);
    for (let i = 0; i < 20; i++) act(s, { type: 'defend' });
    expect(s.battle.defended).toBe(15);
    expect(s.battle.hp).toBe(1000 - 15 * 35);
  });
});
