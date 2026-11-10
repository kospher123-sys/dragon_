// '아군 필요' 전투 스킬 12개의 혼자 판본 (v1.5.0, 실험 규칙 'skills' 안에서 동작).
// 기획: Notion '흑염룡 진행 문서' 2번 표 6번 · 2026-11-08 결정
//   아군 = 레어 총력 방어에 합류한 드래곤. 혼자 싸울 때는 자기에게 걸리는 대체 효과.
//   아군 판본(합류 드래곤 대상)은 아직 없다 → 합류 드래곤이 있어도 지금은 혼자 판본으로 동작한다.
//
// '턴' = 시전한 드래곤의 행동 1회 (실시간 2~4초). 'N턴 동안' = 시전 뒤 드래곤 행동 N번이 지나갈 때까지.
// 피해 기준값 dmg = 그 행동의 기본 피해(기존 공식 그대로). 범위 공격은 기존처럼 살아 있는 적에게 나눠 ×1.4.
import type { Battle, Dragon, Unit } from './engine';

/** 밸런스 비교용 스위치 (tools/balance-skills.ts). 게임에서는 늘 켬 */
export const SOLO = { on: true };

/** 혼자 판본이 있는 스킬 12개 */
export const SOLO_SKILLS = [
  '맞불', '가마 소성', '거품 그물', '발묵', '접순', '루비 발진',
  '구전', '용암 동굴', '능선 박리', '밀랍 봉개', '금박 펴기', '허들 순환',
] as const;
export type SoloSkill = (typeof SOLO_SKILLS)[number];
export const isSoloSkill = (name: string): name is SoloSkill => (SOLO_SKILLS as readonly string[]).includes(name);

/** 관리 창·기획 문서용 혼자 판본 설명 */
export const SOLO_DESC: Record<SoloSkill, string> = {
  맞불: '3턴 동안 맞불을 준비한다. 그사이 큰 공격(용사 공격·약점 강타)이 오면 앞 땅을 먼저 태워 그 피해 −70%, 다음 공격 1번 −30%. 대가로 다음 행동 1번 쉼. 전투당 2회',
  '가마 소성': '레드 생명력 50% 이하에서 3턴 가마 변신: 받는 피해 −40%, 턴마다 최대 생명력 5% 회복, 주는 피해 ×0.85. 끝나면 소성됨(남은 전투 받는 피해 −15%). 전투당 1회',
  '거품 그물': '적 전체에 거품을 한 겹 감는다(최대 3겹, 피해 ×0.6). 블루의 다음 단일 공격이 거품을 터뜨려 다른 적 모두에게 겹당 10%씩 퍼진다',
  발묵: '블루 생명력 40% 이하에서 3턴 먹물 변신: 적 공격 35% 빗나감, 턴마다 최대 생명력 2% 회복(시전 턴 피해 ×0.5). 전투당 1회',
  접순: '친 적에게 접순을 붙인다(피해 ×0.5). 3턴 동안 턴마다 기생 피해(기본 피해의 8%), 다 자라면 열매로 에메랄드 최대 생명력 3% 회복. 동시에 1개',
  '루비 발진': '루비의 공격마다 펌핑 +1(약점 관통 +2), 한 번에 최대 생명력 8% 넘게 맞으면 −1. 6 이상일 때만 발진: 빛이 3번 왕복하며 적 전체를 친다(범위 ×0.6 × 3)',
  구전: '구전 3개를 띄운다(피해 ×0.4). 3턴 동안 턴마다 각각 75% 무작위 적(기본 피해의 8%, 같은 적에 겹치면 합쳐 ×1.5), 25% 폭풍 자신(다음 공격 +30% 충전, 최대 +90%)',
  '용암 동굴': '2턴 동안 동굴에 숨는다: 적 공격이 닿지 않고 행동하지 않으며 턴마다 최대 생명력 3% 회복. 나오면서 분출(적 전체 ×0.6). 전투당 1회',
  '능선 박리': '돌날로 적 1명에게 능선을 새긴다. 2턴 동안 흑요석의 단일 공격은 그 적을 노리고 칠 때마다 +0.1씩 쌓인다. 처치하면 절반을 가장 약한 다음 적으로 이월, 범위 공격을 쓰면 끊김',
  '밀랍 봉개': '지금 생명력을 밀랍 인장에 기록한다(시전 턴 피해 ×0.5). 3턴 안에 기록보다 최대 생명력 25% 넘게 줄면 기록값으로 되돌리고, 쓰러질 피해면 기록값의 70%로 버틴다. 전투당 1회',
  '금박 펴기': '혼자면 금박이 1몫만 붙는다: 황금 최대 생명력 8% 보호막 1턴(시전 턴 피해 ×0.5). 전투당 1회',
  '허들 순환': '4턴 동안 몸을 웅크려 받는 피해 −10%. 서리 생명력이 50% 이하인 동안은 안쪽 자리로 돌아 −25%(시전 턴 피해 ×0.5)',
};

export interface SoloState {
  /** 드래곤 행동 수 */
  turn: number;
  uses: Partial<Record<SoloSkill, number>>;
  /** 건너뛸 행동 수 (맞불 대가) */
  skip: number;
  counter?: number; counterNext?: boolean;
  kiln?: number; fired?: boolean;
  bubble: number;
  ink?: number;
  graft?: { unit: number; dmg: number; ticks: number };
  pump: number;
  storm?: { until: number; dmg: number };
  charge: number;
  cave?: { until: number; dmg: number };
  ridge?: { unit: number; until: number; hits: number };
  seal?: { hp: number; until: number };
  shield: number; shieldUntil?: number;
  huddle?: number;
}

const fresh = (): SoloState => ({ turn: 0, uses: {}, skip: 0, bubble: 0, pump: 0, charge: 0, shield: 0 });
export const soloOf = (b: Battle): SoloState => (b.solo ??= fresh());

const pct = (n: number) => Math.round(n * 100) + '%';
const alive = (b: Battle) => b.units.filter((u) => u.hp > 0);
const hit = (u: Unit | undefined, n: number) => { if (u) u.hp = Math.max(0, u.hp - n); };
/** 기존 범위 공격 규칙: 살아 있는 적에게 나눠 ×1.4 */
const hitArea = (b: Battle, n: number) => { const a = alive(b); for (const u of a) hit(u, (n / Math.max(1, a.length)) * 1.4); };
const used = (k: SoloState, name: SoloSkill) => k.uses[name] ?? 0;
const use = (k: SoloState, name: SoloSkill) => { k.uses[name] = used(k, name) + 1; };
const heal = (d: Dragon, f: number) => { d.hp = Math.min(d.max, d.hp + d.max * f); };

/**
 * 드래곤 행동 시작: 턴 수를 올리고 지속 효과를 한 번씩 처리한다.
 * skip 이 true 면 이번 행동은 공격하지 않는다(label 을 전투 창에 표시).
 */
export function soloTurnStart(b: Battle, d: Dragon, rnd: () => number): { skip: boolean; label?: string } {
  const k = soloOf(b);
  const prev = k.turn++;
  const note = (t: string) => b.log.unshift(t);
  let skip = false, label: string | undefined;

  if (k.kiln !== undefined && prev < k.kiln) { heal(d, 0.05); note('가마 · 온도 콘이 휘었다 · 생명력 +5%'); }
  if (k.kiln !== undefined && k.turn >= k.kiln) { k.kiln = undefined; k.fired = true; note('가마 소성 완료 · 소성됨(받는 피해 −15%)'); }
  if (k.ink !== undefined && prev < k.ink) heal(d, 0.02);
  if (k.ink !== undefined && k.turn >= k.ink) { k.ink = undefined; note('발묵이 거두어졌다'); }
  if (k.counter !== undefined && k.turn >= k.counter) { k.counter = undefined; note('맞불 준비가 꺼졌다'); }
  if (k.graft) {
    const g = k.graft;
    hit(b.units[g.unit], g.dmg);
    if (++g.ticks >= 3) { heal(d, 0.03); k.graft = undefined; note('접순이 열매를 맺었다 · 생명력 +3%'); }
  }
  if (k.storm && prev < k.storm.until) {
    const hits = new Map<Unit, number>();
    let self = 0;
    for (let i = 0; i < 3; i++) {
      if (rnd() < 0.25) { self++; continue; }
      const a = alive(b);
      const u = a[Math.floor(rnd() * a.length)];
      if (u) hits.set(u, (hits.get(u) ?? 0) + 1);
    }
    for (const [u, n] of hits) hit(u, k.storm.dmg * 0.08 * n * (n > 1 ? 1.5 : 1));
    if (self) k.charge = Math.min(0.9, k.charge + 0.3 * self);
    const merged = [...hits.values()].some((n) => n > 1);
    note(`구전 ${3 - self}개 적중${merged ? ' · 겹쳐 터짐' : ''}${self ? ` · 폭풍 충전 +${self * 30}%` : ''}`);
  }
  if (k.storm && k.turn >= k.storm.until) k.storm = undefined;
  if (k.cave) {
    if (prev < k.cave.until) heal(d, 0.03);
    if (k.turn >= k.cave.until) {
      hitArea(b, k.cave.dmg * 0.6);
      k.cave = undefined;
      note('용암 동굴에서 분출하며 뛰쳐나왔다');
      skip = true; label = '용암 분출';
    } else { skip = true; label = '용암 동굴 속 · 회복 중'; }
  }
  if (k.ridge && k.turn > k.ridge.until) { k.ridge = undefined; }
  if (k.seal && k.turn >= k.seal.until) { k.seal = undefined; note('밀랍 인장이 굳어 떨어졌다'); }
  if (k.shieldUntil !== undefined && k.turn >= k.shieldUntil) { k.shield = 0; k.shieldUntil = undefined; }
  if (k.huddle !== undefined && k.turn >= k.huddle) k.huddle = undefined;
  if (!skip && k.skip > 0) { k.skip--; skip = true; label = '맞불 뒤 숨 고르기'; }
  return { skip, label };
}

/** 조건이 안 맞거나 이미 걸려 있는 스킬은 '파멸의 발톱'(단일 공격)으로 바꾼다 */
export function soloResolve(b: Battle, d: Dragon, skill: string): string {
  if (!isSoloSkill(skill)) return skill;
  const k = soloOf(b);
  const r = d.hp / d.max;
  const ok: Record<SoloSkill, boolean> = {
    맞불: used(k, '맞불') < 2 && k.counter === undefined,
    '가마 소성': r <= 0.5 && used(k, '가마 소성') < 1 && k.kiln === undefined,
    '거품 그물': true,
    발묵: r <= 0.4 && used(k, '발묵') < 1,
    접순: !k.graft,
    '루비 발진': k.pump >= 6,
    구전: !k.storm,
    '용암 동굴': used(k, '용암 동굴') < 1,
    '능선 박리': !k.ridge,
    '밀랍 봉개': used(k, '밀랍 봉개') < 1 && !k.seal,
    '금박 펴기': used(k, '금박 펴기') < 1 && k.shield <= 0,
    '허들 순환': k.huddle === undefined,
  };
  return ok[skill] ? skill : '파멸의 발톱';
}

/**
 * 드래곤 공격 적용 (실험 규칙 skills 일 때 기존 피해 적용 코드를 대신한다).
 * area: 이 스킬의 기본 범위 여부, focus: 전술 '집중 공격' 중인지.
 * 돌려주는 값: 전투 창에 쓸 덧붙임 문구와 실제 기준 피해.
 */
export function soloAttack(b: Battle, d: Dragon, skill: string, base: number, crit: boolean, area: boolean, focus: boolean, rnd: () => number): { note: string; dmg: number } {
  const k = soloOf(b);
  const notes: string[] = [];
  let mul = 1;
  if (k.charge > 0) { mul *= 1 + k.charge; notes.push(`충전 +${pct(k.charge)}`); k.charge = 0; }
  if (k.kiln !== undefined) mul *= 0.85;
  const a = alive(b);
  let target: Unit | undefined = focus ? [...a].sort((x, y) => x.hp - y.hp)[0] : a[Math.floor(rnd() * a.length)];
  let spread = area && !focus;
  let passes = 1;

  switch (isSoloSkill(skill) ? skill : null) {
    case '맞불': k.counter = k.turn + 3; use(k, '맞불'); notes.push('맞불 준비'); break;
    case '가마 소성': k.kiln = k.turn + 3; use(k, '가마 소성'); notes.push('가마 변신'); break;
    case '거품 그물': k.bubble = Math.min(3, k.bubble + 1); mul *= 0.6; spread = true; notes.push(`거품 ${k.bubble}겹`); break;
    case '발묵': k.ink = k.turn + 3; use(k, '발묵'); mul *= 0.5; notes.push('먹물이 번진다'); break;
    case '루비 발진': spread = true; passes = 3; mul *= 0.6; k.pump = 0; notes.push('빛 3왕복'); break;
    case '구전': k.storm = { until: k.turn + 3, dmg: base }; mul *= 0.4; notes.push('구전 3개'); break;
    case '용암 동굴': k.cave = { until: k.turn + 2, dmg: base }; use(k, '용암 동굴'); mul = 0; notes.push('동굴로 숨는다'); break;
    case '능선 박리': break;
    case '밀랍 봉개': k.seal = { hp: d.hp, until: k.turn + 3 }; use(k, '밀랍 봉개'); mul *= 0.5; notes.push(`인장 ${pct(d.hp / d.max)}`); break;
    case '금박 펴기': k.shield = d.max * 0.08; k.shieldUntil = k.turn + 1; use(k, '금박 펴기'); mul *= 0.5; notes.push('금박 보호막'); break;
    case '허들 순환': k.huddle = k.turn + 4; mul *= 0.5; notes.push('허들'); break;
    case '접순': mul *= 0.5; break;
    default: break;
  }

  // 흑요석 능선: 걸려 있는 동안 단일 공격은 능선 적을 노리고 쌓인다. 범위 공격은 끊는다.
  if (k.ridge && skill !== '능선 박리') {
    if (spread) { k.ridge = undefined; notes.push('능선 끊김'); }
    else {
      const u = b.units[k.ridge.unit];
      if (u && u.hp > 0) { target = u; k.ridge.hits++; mul *= 1 + 0.1 * k.ridge.hits; notes.push(`능선 +${k.ridge.hits}`); }
    }
  }

  const dmg = base * mul;
  if (spread) for (let i = 0; i < passes; i++) hitArea(b, dmg);
  else hit(target, dmg);

  if (skill === '능선 박리' && target) {
    k.ridge = { unit: b.units.indexOf(target), until: k.turn + 2, hits: 0 };
    notes.push('능선');
  }
  if (k.ridge) {
    const u = b.units[k.ridge.unit];
    if (u && u.hp <= 0) {
      const next = alive(b).sort((x, y) => x.hp - y.hp)[0];
      k.ridge = next ? { ...k.ridge, unit: b.units.indexOf(next), hits: Math.floor(k.ridge.hits / 2) } : undefined;
      if (next) notes.push('능선 이월');
    }
  }
  if (skill === '접순' && target) k.graft = { unit: b.units.indexOf(target), dmg: base * 0.08, ticks: 0 };
  // 블루: 거품을 감아 둔 뒤의 단일 공격이 거품을 터뜨린다
  if (d.species === 2 && !spread && k.bubble > 0 && skill !== '거품 그물') {
    for (const u of alive(b)) if (u !== target) hit(u, dmg * 0.1 * k.bubble);
    notes.push(`거품 ${k.bubble}겹 터짐`);
    k.bubble = 0;
  }
  // 루비: 공격마다 펌핑
  if (d.species === 5 && skill !== '루비 발진' && mul > 0) k.pump = Math.min(9, k.pump + (crit ? 2 : 1));
  return { note: notes.join(' · '), dmg: dmg * passes };
}

/** 적 공격이 드래곤에게 닿기 전 보정. 돌려주는 값: 실제 피해 */
export function soloIncoming(b: Battle, d: Dragon, dmg: number, big: boolean, rnd: () => number): number {
  const k = soloOf(b);
  if (k.cave) return 0;
  if (k.ink !== undefined && rnd() < 0.35) { b.log.unshift('먹물에 가려 적 공격이 빗나갔다'); return 0; }
  if (k.counter !== undefined && big) {
    dmg *= 0.3; k.counter = undefined; k.counterNext = true; k.skip++;
    b.log.unshift('맞불 발동 · 큰 공격 피해 −70%');
  } else if (k.counterNext) { dmg *= 0.7; k.counterNext = false; }
  if (k.kiln !== undefined) dmg *= 0.6;
  else if (k.fired) dmg *= 0.85;
  if (k.huddle !== undefined) dmg *= d.hp <= d.max * 0.5 ? 0.75 : 0.9;
  if (k.shield > 0) {
    const absorbed = Math.min(k.shield, dmg);
    k.shield -= absorbed; dmg -= absorbed;
    if (k.shield <= 0) { k.shieldUntil = undefined; b.log.unshift('금박이 다 벗겨졌다'); }
  }
  if (d.species === 5 && dmg > d.max * 0.08) k.pump = Math.max(0, k.pump - 1);
  return dmg;
}

/** 피해를 받은 직후: 밀랍 인장 판정 */
export function soloAfterHit(b: Battle, d: Dragon) {
  const k = soloOf(b);
  if (!k.seal) return;
  if (d.hp <= 0) { d.hp = Math.max(1, k.seal.hp * 0.7); k.seal = undefined; b.log.unshift('밀랍 인장이 쓰러짐을 막았다'); }
  else if (d.hp <= k.seal.hp - d.max * 0.25) { d.hp = k.seal.hp; k.seal = undefined; b.log.unshift('밀랍 인장 · 생명력을 기록값으로 되돌렸다'); }
}

/** 전투 창 표시용: 지금 걸려 있는 효과 */
export function soloStatus(b: Battle): string[] {
  const k = b.solo;
  if (!k) return [];
  const left = (until: number) => Math.max(0, until - k.turn);
  const out: string[] = [];
  if (k.counter !== undefined) out.push(`맞불 준비 ${left(k.counter)}턴`);
  if (k.kiln !== undefined) out.push(`가마 ${left(k.kiln)}턴`);
  else if (k.fired) out.push('소성됨');
  if (k.bubble) out.push(`거품 ${k.bubble}겹`);
  if (k.ink !== undefined) out.push(`발묵 ${left(k.ink)}턴`);
  if (k.graft) out.push(`접순 ${k.graft.ticks}/3`);
  if (k.pump) out.push(`펌핑 ${k.pump}/6`);
  if (k.storm) out.push(`구전 ${left(k.storm.until)}턴`);
  if (k.charge) out.push(`충전 +${pct(k.charge)}`);
  if (k.cave) out.push(`동굴 ${left(k.cave.until)}턴`);
  if (k.ridge) out.push(`능선 +${k.ridge.hits}`);
  if (k.seal) out.push(`밀랍 인장 ${left(k.seal.until)}턴`);
  if (k.shield > 0) out.push(`금박 ${Math.round(k.shield)}`);
  if (k.huddle !== undefined) out.push(`허들 ${left(k.huddle)}턴`);
  return out;
}
