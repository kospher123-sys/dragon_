import { describe, it, expect } from 'vitest';
import { newState, act, step, catchUp, newCtx, importWeb, validate, canHunt } from '../src/engine/engine';
import { T } from '../src/engine/data';

const run = (s: ReturnType<typeof newState>, seconds: number) => {
  const ctx = newCtx();
  for (let t = 0; t < seconds; t += 0.5) step(s, 0.5, ctx);
  return ctx;
};

describe('engine', () => {
  it('새 연대기는 이름을 받기 전까지 멈춰 있다', () => {
    const s = newState(42);
    run(s, 100);
    expect(s.time).toBe(0);
    expect(act(s, { type: 'start', name: '' })).toBeTruthy();
    expect(act(s, { type: 'start', name: '카르' })).toBeNull();
    run(s, 100);
    expect(s.time).toBe(100);
    expect(s.dragons).toHaveLength(12);
  });

  it('사냥은 편도 9분 뒤 전투를 시작한다', () => {
    const s = newState(7);
    act(s, { type: 'start', name: '카르' });
    const d = s.dragons[0];
    expect(canHunt(s, d)).toBeNull();
    expect(act(s, { type: 'hunt', id: d.id, target: 0 })).toBeNull();
    expect(d.mission?.left).toBe(T.TRAVEL);
    expect(T.TRAVEL).toBe(540);
    // 이벤트에 방해받지 않게 다음 이벤트를 미룬다
    s.nextEvent = 1e9;
    run(s, T.TRAVEL + 1);
    expect(s.battle?.dragon).toBe(d.id);
  });

  it('지원 요청은 5분 동안 답이 없으면 자동 거절된다', () => {
    const s = newState(9);
    act(s, { type: 'start', name: '카르' });
    s.prompt = { kind: 'support', target: 3, known: true, force: 500, expires: s.time + T.SUPPORT_TIMEOUT };
    s.nextEvent = 1e9;
    const before = s.relations[3];
    run(s, T.SUPPORT_TIMEOUT + 1);
    expect(s.prompt).toBeNull();
    expect(s.relations[3]).toBe(before - 8);
  });

  it('따라잡기 중에는 지원 요청이 생기지 않는다', () => {
    const s = newState(11);
    act(s, { type: 'start', name: '카르' });
    const ctx = newCtx(true);
    for (let i = 0; i < 4 * 3600 * 2; i++) {
      step(s, 0.5, ctx);
      expect(s.prompt).toBeNull();
      if (s.over) break;
    }
  });

  it('따라잡기 요약을 만든다', () => {
    const s = newState(5);
    act(s, { type: 'start', name: '카르' });
    const sum = catchUp(s, 3600);
    expect(sum.seconds).toBe(3600);
    expect(s.time).toBeCloseTo(3600, 5);
    expect(sum.levels).toBeGreaterThanOrEqual(0);
  });

  it('웹 버전 저장 파일을 가져오면 시간에 배율을 곱한다', () => {
    const web = { format: 'blackflame-local', revision: 3, state: {
      version: 1, time: 1000, seed: 123, dragons: [{ id: 'd1', name: '', species: 0, grade: 1, level: 3, xp: 0, age: 950, hp: 300, max: 400, power: 30, energy: 80, injury: 0, home: 0, generation: 1, born: 0, laid: 0, mission: { kind: 'hunt', target: 2, left: 60, total: 180 } }],
      eggs: [{ id: 'e1', species: 0, left: 100, generation: 2 }], relations: Array(12).fill(35), towns: [{ name: '아르덴 왕도', army: 1200, ruin: 0 }], events: [], prompt: null, battle: null, resources: 0, nextEvent: 300, over: false,
    } };
    const s = importWeb(web);
    validate(s);
    expect(s.time).toBe(3000);
    expect(s.dragons[0].mission?.left).toBe(180);
    expect(s.eggs[0].left).toBe(300);
    expect(s.dragons[0].name).not.toBe('');
  });
});

describe('꺼져 있던 동안 보호', () => {
  it('따라잡기 중에는 드래곤이 죽지 않고 알도 잃지 않는다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = newState(seed * 97);
      act(s, { type: 'start', name: '카르' });
      catchUp(s, 8 * 3600);
      expect(s.dragons.filter((d) => d.dead)).toHaveLength(0);
      expect(s.over).toBe(false);
    }
  });
});
