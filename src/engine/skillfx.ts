// 종족 고유 전투 스킬 36개의 효과 (실험 규칙 'skills' 안에서 동작). v1.6.0
//
// 기획 원본: Notion '흑염룡 드래곤 스킬 기획' 12종 페이지. 진행 문서 3장 2026-11-09 결정:
//   ① 수치는 밸런스에 맞춰 줄인다  ② 검토 교체안은 반영하지 않는다
//   ③ 적 쪽 확장(공격 종류·큰 공격 예고·적 버프·회피·적별 공격력·행동 지연)을 넣는다
//   ④ 스킬은 조건·쿨다운·우선순위에 따라 자동으로 고른다 (궁극기 > 방어 > 공격 > 파멸의 발톱)
//
// '턴' = 시전한 드래곤의 행동 1회(실시간 2~4초). 'N턴 동안' = 시전 뒤 드래곤 행동 N번이 지날 때까지.
// 피해 기준값 base = 그 행동의 기본 피해(기존 공식). 범위 공격은 기존처럼 살아 있는 적에게 나눠 ×1.4.
// '아군 필요' 12개는 아직 혼자 판본(아군 = 레어 총력 방어 합류 드래곤 판본은 다음 단계).
import type { Battle, Dragon, State, Unit } from './engine';

/** 밸런스 비교용 스위치 (tools/balance-skills.ts). 끄면 v1.4 방식(무작위 선택·효과 없음). 게임에서는 늘 켬 */
export const FX = { on: true, /** 밸런스 측정용: 스킬은 쓰지 않고 적 쪽 확장만 */ enemyOnly: false };
/** 예전 이름 (v1.5 도구 호환) */
export const SOLO = FX;

// ---------------------------------------------------------------- 스킬 목록·설명

/** '아군 필요' 스킬 12개 (혼자 판본) */
export const SOLO_SKILLS = [
  '맞불', '가마 소성', '거품 그물', '발묵', '접순', '루비 발진',
  '구전', '용암 동굴', '능선 박리', '밀랍 봉개', '금박 펴기', '허들 순환',
] as const;
export type SoloSkill = (typeof SOLO_SKILLS)[number];
export const isSoloSkill = (name: string): name is SoloSkill => (SOLO_SKILLS as readonly string[]).includes(name);

/** 전투 스킬 36개의 실제 효과 설명 (관리 창). 생활 스킬은 life.ts */
export const EFFECT_DESC: Record<string, string> = {
  // 0 흑염룡
  '흑염 낙인': '쿨 2. 흑염으로 적 하나를 ×1.2로 치고 그 적 무리 이름에 낙인을 새긴다(최대 6). 낙인 찍힌 적과 다시 싸우면 이 전투 첫 낙인 공격은 ×1.5, 적 사기 −10',
  '혈통 인장': '생명력 80% 이하·쿨 6. 3턴 동안 적 단일 공격 20%가 인장에 막힌다(시전 턴 피해 ×0.6)',
  '재의 기록': '생명력 30% 이하·전사한 선대 흑염룡이 있을 때 1회. 3턴 동안 그림자가 턴마다 기본 피해 40%로 친다',
  // 1 레드
  '열 관성': '쿨 3. 레드가 행동할 때마다 열 +1(최대 5), 게임 시간 10분마다 1씩 식는다(전투가 끝나도 남음). 이 공격은 ×(1 + 0.02×열)',
  // 2 블루
  물그림자: '생명력 85% 이하·쿨 6. 물그림자가 적의 단일 공격 1번을 대신 맞는다(시전 턴 피해 ×0.5)',
  // 3 에메랄드
  '덩굴 울타리': '생명력 80% 이하·1회. 마지막으로 세운 뒤 지난 게임 시간 1시간마다 한 단계 자람(처음은 1단계, 최대 3). 최대 생명력 (4% + 단계×3%) 보호막 3턴(시전 턴 피해 ×0.5)',
  '휘묻이 숲': '생명력 40% 이하·1회. 3턴 동안 턴마다 묘목 뿌리가 적 전체에 기본 피해 10%, 적 하나의 다음 행동을 1.5초 늦춘다',
  // 4 백은
  '회전 등명': '쿨 6. 4턴 동안 정해 둔 순서로 적을 하나씩 비춘다: 비춰진 적은 회피 불가, 턴마다 섬광 2번(기본 피해 10%씩). 시전 공격 ×0.6',
  '안개 막': '생명력 80% 이하·쿨 6. 3턴 동안 적 단일 공격이 가짜 실루엣에 15% 빗나가고, 그렇게 친 적은 드러나 다음 백은 공격 ×1.2(시전 턴 피해 ×0.5)',
  '브로켄 강림': '전투 4번째 행동 이후·앞에서 다른 고유 스킬을 쓴 뒤 1회. 3턴 동안 받는 피해 −10%, 턴마다 생명력 2% 회복',
  // 5 루비
  성채: '맞을 때마다 결정 +1(최대 3)·쿨 5. 결정 3개면 이 공격이 여섯 줄기로 갈라져 적 전체를 친다(범위)',
  '패싯 전반사': '생명력 85% 이하·쿨 6. 3턴 동안 적마다 첫 공격 뒤 그쪽 면이 깎여, 같은 적의 다음 공격 −10%·10% 되튕김(시전 턴 피해 ×0.5)',
  // 6 호박
  '호박 봉입': '쿨 6. 무작위 적 하나를 2턴 동안 가둔다(행동 불가). 그 적이 받는 피해는 모았다가 끝날 때 ×1.2로 한꺼번에 들어간다',
  '분봉': '호박 봉입이 그 적 최대 생명력 50% 이상으로 깨졌을 때 1회. 불벌 떼 3무리가 3턴 동안 턴마다 무리당 기본 피해 10%, 적 범위 공격에 1무리씩 흩어지고 끝날 때 남은 무리마다 생명력 3% 회복',
  // 7 화산
  '내리막 화쇄류': '쿨 3. 생명력 비율이 가장 높은 적에서 시작해, 비율이 더 낮은 적으로만 흘러가며 최대 3곳 ×0.5 → 0.35 → 0.245',
  '분화 경보': '생명력 70% 이하·1회. 4턴 단계: 초록(적 행동 순서 섞기) → 노랑(적 받는 피해 +10%, 경보 끝까지) → 주황(화산탄 3발, 기본 피해 30%씩) → 빨강(적 전체 ×1.2). 화산이 한 번에 최대 생명력 20% 넘게 맞으면 단계 정체(최대 2번)',
  // 8 흑요석
  '정밀 절제': '이로운 효과(버프)가 있는 적이 있을 때·쿨 2. 버프가 가장 많은 적에게서 최대 2개를 잘라 내고 개수당 ×0.35 추가 피해, 그 적은 2턴 동안 버프를 다시 얻지 못한다',
  '루퍼트의 눈물': '생명력 85% 이하·쿨 6. 3턴 자세: 단일 공격 피해 −15%. 범위 공격을 맞으면 산산조각(그 피해 +30%), 적 전체에 파편 ×0.8, 흑요석 1턴 쉼(시전 턴 피해 ×0.5)',
  // 9 황금
  '금화 대출': '쿨 5. 공격력 가장 낮은 적에게 2턴 동안 공격 +15%를 빌려주고, 그 적이 황금에게 준 피해를 장부에 적는다. 만기에 장부 ×1.2 + 기본 피해 ×0.8 상환 피해, 장부의 30%(최대 생명력 20%까지) 회복',
  '내림 경매': '전투 3번째 행동 이후·1회. 왕관 낙찰가(생명력 30%)가 턴마다 10%p 내려가고(최저 5%) 적이 먼저 가져갈 확률은 12.5%p씩 오른다(최대 50%). 낙찰가 10% 이하이고 남는 생명력이 30% 넘으면 황금이 낙찰: 적 버프 몰수, 적 전체 ×1.8, 3턴 받는 피해 −20%. 적이 가져가면 적 전체 공격 +15% 3번',
  // 10 서리
  '눈사태 유도': '쿨 없음, 마지막 사용 뒤 3턴 이상 지나야 씀. 쌓인 눈 3턴이면 적 1명 ×1.4·그 적 행동 1초 늦춤, 4턴이면 적 전체 ×1.5·모두 행동 1초 늦춤',
  '얼어붙은 시간': '생명력 60% 이하·1회. 자발 2턴 변신: 서리는 행동하지 않고 받는 피해 −50%. 적이 행동할 때마다 그 적에 서리층 +1, 3층이면 그 적 다음 행동을 건너뛰고 서리의 다음 공격 ×1.5',
  // 11 폭풍
  '선행 방전': '쿨 4. 대상 선택 없이 지금 공격력이 가장 높은 적에게 ×1.05, 그 적 공격 버프 해제·다음 2번 공격 −10%',
  '회로 차단기': '생명력 90% 이하·1회 켬. 남은 전투 동안 3번까지, 한 번에 최대 생명력 30% 넘는 피해를 30%에서 자르고 폭풍의 다음 행동 1번을 건너뛴다(시전 턴 피해 ×0.5)',
  // ---- '아군 필요' 12개 혼자 판본 (v1.5.0, 조건 자동 선택으로 바뀜) ----
  맞불: '적이 큰 공격을 예고하면 자동으로 쓴다(전투당 2회). 3턴 안에 큰 공격이 오면 그 피해 −30%, 다음 공격 1번 −15%. 대가로 다음 행동 1번 쉼',
  '가마 소성': '레드 생명력 50% 이하에서 3턴 가마 변신: 받는 피해 −30%, 턴마다 최대 생명력 3% 회복, 주는 피해 ×0.85. 끝나면 소성됨(남은 전투 받는 피해 −10%). 전투당 1회',
  '거품 그물': '쿨 2. 적 전체에 거품을 한 겹 감는다(최대 3겹, 피해 ×0.6). 블루의 다음 단일 공격이 거품을 터뜨려 다른 적 모두에게 겹당 10%씩 퍼진다',
  발묵: '블루 생명력 40% 이하에서 3턴 먹물 변신: 적 공격 35% 빗나감, 턴마다 최대 생명력 2% 회복(시전 턴 피해 ×0.5). 전투당 1회',
  접순: '접순이 없을 때·쿨 3. 친 적에게 접순을 붙인다(피해 ×0.5). 3턴 동안 턴마다 기생 피해(기본 피해의 5%), 다 자라면 열매로 에메랄드 최대 생명력 2% 회복',
  '루비 발진': '루비의 공격마다 펌핑 +1(약점 관통 +2), 한 번에 최대 생명력 8% 넘게 맞으면 −1. 8 이상일 때만 발진: 빛이 3번 왕복하며 적 전체를 친다(범위 ×0.6 × 3)',
  구전: '구전이 없을 때·쿨 6. 구전 3개를 띄운다(피해 ×0.4). 3턴 동안 턴마다 각각 75% 무작위 적(기본 피해의 6%, 같은 적에 겹치면 합쳐 ×1.5), 25% 폭풍 자신(다음 공격 +20% 충전, 최대 +60%)',
  '용암 동굴': '생명력 60% 이하·1회. 2턴 동안 동굴에 숨는다: 적 공격이 닿지 않고 행동하지 않으며 턴마다 최대 생명력 2% 회복. 나오면서 분출(적 전체 ×0.6)',
  '능선 박리': '능선이 없을 때·쿨 6. 돌날로 적 1명에게 능선을 새긴다. 2턴 동안 흑요석의 단일 공격은 그 적을 노리고 칠 때마다 +0.1씩 쌓인다. 처치하면 절반을 가장 약한 다음 적으로 이월, 범위 공격을 쓰면 끊김',
  '밀랍 봉개': '생명력 80% 이하·1회. 지금 생명력을 밀랍 인장에 기록한다(시전 턴 피해 ×0.5). 3턴 안에 기록보다 최대 생명력 25% 넘게 줄면 기록값으로 되돌리고, 쓰러질 피해면 기록값의 70%로 버틴다',
  '금박 펴기': '생명력 80% 이하·1회. 혼자면 금박이 1몫만 붙는다: 황금 최대 생명력 8% 보호막 1턴(시전 턴 피해 ×0.5)',
  '허들 순환': '생명력 85% 이하·쿨 6. 4턴 동안 몸을 웅크려 받는 피해 −10%. 서리 생명력이 50% 이하인 동안은 안쪽 자리로 돌아 −25%(시전 턴 피해 ×0.5)',
};

/** 관리 창·기획 문서용 혼자 판본 설명 (v1.5 호환) */
export const SOLO_DESC = Object.fromEntries(SOLO_SKILLS.map((n) => [n, EFFECT_DESC[n]])) as Record<SoloSkill, string>;

// ---------------------------------------------------------------- 적 쪽 확장

/** 적 역할별 공격 배율 (평균이 예전과 비슷하게). 용사는 예전 ×1.6 대신 보통 ×1.45, 예고한 큰 공격 ×3.4 (버프·예고로 쉬는 행동을 메우도록 조금 높게) */
export const ROLE_ATK: Record<string, number> = { 용사: 1.45, 창기사: 1.2, 궁수: 0.9, 마법사: 1.05, 치유사: 1.0, 암살자: 1.05 };
/** 드래곤의 단일 공격을 피하는 확률 */
export const ROLE_EVADE: Record<string, number> = { 궁수: 0.12, 암살자: 0.15 };
/** 범위 공격을 하는 역할 (용사는 큰 공격만 범위) */
const AREA_ROLE = new Set(['마법사']);
export const BIG_MUL = 3.4;
/** 큰 공격 예고 뒤 실제 공격까지 (초) */
export const TELEGRAPH = 3;

export interface Buff { k: 'atk' | 'def'; v: number; n: number }
export interface EnemyFx {
  buffs: Buff[];
  /** 공격 횟수 (용사 예고 주기) */
  acts: number;
  /** 큰 공격 예고 중 */
  charge?: boolean;
  /** 공격 약화 (선행 방전): 남은 공격 수 */
  weak: number;
  /** 버프 재획득 불가 (드래곤 턴) */
  noBuff?: number;
  /** 다음 행동 건너뜀 */
  skipNext: number;
  /** 얼어붙은 시간 서리층 */
  frost: number;
  /** 패싯: 이 적이 이미 한 번 쳤다 */
  faceted?: boolean;
  /** 안개 막: 드러남 */
  revealed?: boolean;
}

// ---------------------------------------------------------------- 상태

export interface FxState {
  /** 드래곤 행동 수 */
  turn: number;
  uses: Record<string, number>;
  /** 스킬 이름 → 다시 쓸 수 있는 턴 */
  ready: Record<string, number>;
  /** 건너뛸 행동 수 */
  skip: number;
  e: EnemyFx[];
  /** 공격·방어 스킬을 쓴 적 있음 (브로켄 조건) */
  used?: boolean;
  // 혼자 판본 12개 (v1.5)
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
  // 나머지 24개
  branded?: boolean;
  blood?: number;
  shadow?: { until: number; dmg: number };
  decoy: number;
  grove?: { until: number; dmg: number };
  spot?: { order: number[]; start: number; dmg: number };
  fog?: number;
  giant?: number;
  crystals: number;
  facet?: number;
  amber?: { unit: number; until: number; stored: number };
  swarmReady?: boolean;
  swarm?: { n: number; until: number; dmg: number };
  alarm?: { stage: number; stalls: number; dmg: number; hold?: boolean };
  /** 분화 경보 노랑 이후: 적 받는 피해 ×1.2 */
  exposed?: boolean;
  tear?: number;
  loan?: { unit: number; until: number; ledger: number; dmg: number };
  auction?: { price: number; steal: number };
  crown?: number;
  /** 눈사태: 마지막 사용 턴 */
  snow: number;
  freeze?: number; frostBonus?: boolean;
  breaker: number;
  /** 생활 스킬 정밀 봉합: 첫 피격 −15% */
  guard?: boolean;
}

const fresh = (b: Battle): FxState => ({
  turn: 0, uses: {}, ready: {}, skip: 0, e: b.units.map(() => newEnemy()),
  bubble: 0, pump: 0, charge: 0, shield: 0, decoy: 0, crystals: 0, snow: 0, breaker: 0,
});
const newEnemy = (): EnemyFx => ({ buffs: [], acts: 0, weak: 0, skipNext: 0, frost: 0 });
export const fxOf = (b: Battle): FxState => {
  const k = (b.fx ??= fresh(b));
  while (k.e.length < b.units.length) k.e.push(newEnemy());
  return k;
};
/** v1.5 이름 */
export const soloOf = fxOf;
export type SoloState = FxState;

// ---------------------------------------------------------------- 도우미

const pct = (n: number) => Math.round(n * 100) + '%';
const alive = (b: Battle) => b.units.filter((u) => u.hp > 0);
const used = (k: FxState, name: string) => k.uses[name] ?? 0;
const use = (k: FxState, name: string, cd = 0) => { k.uses[name] = used(k, name) + 1; if (cd) k.ready[name] = k.turn + cd; };
const heal = (d: Dragon, f: number) => { d.hp = Math.min(d.max, d.hp + d.max * f); };
const idx = (b: Battle, u: Unit | undefined) => (u ? b.units.indexOf(u) : -1);
const note = (b: Battle, t: string) => b.log.unshift(t);
/** 지금 공격력 배율 (역할 × 버프 × 약화) */
export function enemyAtk(b: Battle, i: number): number {
  const u = b.units[i], e = fxOf(b).e[i];
  let m = ROLE_ATK[u.role] ?? 1;
  for (const x of e.buffs) if (x.k === 'atk') m *= 1 + x.v;
  if (e.weak > 0) m *= 0.9;
  return m;
}
const buffCount = (e: EnemyFx) => e.buffs.length;

/**
 * 드래곤 → 적 피해. single 이면 회피 판정. 봉입된 적은 피해를 모은다. 돌려주는 값: 실제로 들어간(또는 모인) 피해
 */
function hitU(b: Battle, u: Unit | undefined, n: number, single: boolean, rnd: () => number): number {
  if (!u || u.hp <= 0 || n <= 0) return 0;
  const k = fxOf(b), i = idx(b, u), e = k.e[i];
  if (single && !(k.spot && litIndex(k) === i) && rnd() < (ROLE_EVADE[u.role] ?? 0)) { note(b, `${u.role}이(가) 피했다`); return 0; }
  for (const x of e.buffs) if (x.k === 'def') n *= 1 - x.v;
  if (k.exposed) n *= 1.1;
  if (k.amber && k.amber.unit === i) { k.amber.stored += n; return n; }
  u.hp = Math.max(0, u.hp - n);
  return n;
}
function hitArea(b: Battle, n: number, rnd: () => number) {
  const a = alive(b);
  let sum = 0;
  for (const u of a) sum += hitU(b, u, (n / Math.max(1, a.length)) * 1.4, false, rnd);
  return sum;
}
function litIndex(k: FxState): number {
  if (!k.spot) return -1;
  return k.spot.order[(k.turn - k.spot.start) % k.spot.order.length] ?? -1;
}

// ---------------------------------------------------------------- 스킬 자동 선택

export interface Env {
  /** 전사한 선대 흑염룡 수 (재의 기록) */
  ancestors: number;
  /** 낙인 찍힌 적 이름 */
  brands: string[];
  /** 지금 게임 시각 (덩굴 울타리 성장) */
  now: number;
  vineAt?: number;
}
export function envOf(s: State): Env {
  return {
    ancestors: s.dragons.filter((x) => x.dead && x.species === 0 && x.home === 0).length,
    brands: s.brands ?? [],
    now: s.time,
    vineAt: s.vineAt,
  };
}
/** 전투 적 이름 ('지역 · 적' 의 뒤쪽) */
export const foeOf = (b: Battle) => b.place.split(' · ').pop() || b.place;

/** 스킬별 발동 조건 (쿨다운은 따로) */
function canUse(b: Battle, d: Dragon, name: string, env: Env): boolean {
  const k = fxOf(b);
  const r = d.hp / d.max;
  if ((k.ready[name] ?? 0) > k.turn) return false;
  const anyCharge = k.e.some((e, i) => e.charge && b.units[i].hp > 0);
  switch (name) {
    // 흑염룡
    case '흑염 낙인': return true;
    case '혈통 인장': return r <= 0.8 && k.blood === undefined;
    case '재의 기록': return r <= 0.3 && env.ancestors > 0 && used(k, name) < 1;
    // 레드
    case '열 관성': return true;
    case '맞불': return anyCharge && used(k, name) < 2 && k.counter === undefined;
    case '가마 소성': return r <= 0.5 && used(k, name) < 1 && k.kiln === undefined;
    // 블루
    case '거품 그물': return k.bubble < 3;
    case '물그림자': return r <= 0.85 && k.decoy <= 0;
    case '발묵': return r <= 0.4 && used(k, name) < 1;
    // 에메랄드
    case '접순': return !k.graft;
    case '덩굴 울타리': return r <= 0.8 && used(k, name) < 1;
    case '휘묻이 숲': return r <= 0.4 && used(k, name) < 1;
    // 백은
    case '회전 등명': return !k.spot && alive(b).length > 0;
    case '안개 막': return r <= 0.8 && k.fog === undefined;
    case '브로켄 강림': return k.turn >= 3 && !!k.used && used(k, name) < 1;
    // 루비
    case '성채': return k.crystals >= 3;
    case '패싯 전반사': return r <= 0.85 && k.facet === undefined;
    case '루비 발진': return k.pump >= 8;
    // 호박
    case '호박 봉입': return !k.amber && alive(b).length > 0;
    case '밀랍 봉개': return r <= 0.8 && used(k, name) < 1 && !k.seal;
    case '분봉': return !!k.swarmReady && used(k, name) < 1;
    // 화산
    case '내리막 화쇄류': return true;
    case '용암 동굴': return r <= 0.6 && used(k, name) < 1;
    case '분화 경보': return r <= 0.7 && used(k, name) < 1;
    // 흑요석
    case '정밀 절제': return k.e.some((e, i) => buffCount(e) > 0 && b.units[i].hp > 0);
    case '루퍼트의 눈물': return r <= 0.85 && k.tear === undefined;
    case '능선 박리': return !k.ridge;
    // 황금
    case '금화 대출': return !k.loan && alive(b).length > 0;
    case '금박 펴기': return r <= 0.8 && used(k, name) < 1 && k.shield <= 0;
    case '내림 경매': return k.turn >= 2 && used(k, name) < 1;
    // 서리
    case '눈사태 유도': return k.turn - k.snow >= 3;
    case '허들 순환': return r <= 0.85 && k.huddle === undefined;
    case '얼어붙은 시간': return r <= 0.6 && used(k, name) < 1;
    // 폭풍
    case '선행 방전': return alive(b).length > 0;
    case '회로 차단기': return r <= 0.9 && used(k, name) < 1;
    case '구전': return !k.storm;
    default: return false;
  }
}

/** 시전 뒤 쿨다운 (턴). 1회용은 uses 로 막는다 */
const COOLDOWN: Record<string, number> = {
  '흑염 낙인': 2, '혈통 인장': 6, '열 관성': 3, '거품 그물': 2, '물그림자': 6, '접순': 3, '회전 등명': 6, '안개 막': 6,
  '패싯 전반사': 6, '성채': 5, '호박 봉입': 6, '내리막 화쇄류': 3, '정밀 절제': 2, '루퍼트의 눈물': 6, '금화 대출': 5,
  '허들 순환': 6, '선행 방전': 4, '능선 박리': 6, '구전': 6,
};

/**
 * 이번 행동에 쓸 스킬 이름. 우선순위: 궁극기 > 방어 > 공격 > 파멸의 발톱.
 * names = [공격, 방어, 생활, 궁극기] 이름 (skills.ts skillsOf).
 */
export function fxPick(b: Battle, d: Dragon, names: string[], env: Env, rnd?: () => number): string {
  if (FX.enemyOnly) return [names[0], names[1], names[3], '파멸의 발톱'][Math.floor((rnd?.() ?? 0) * 4)];
  for (const n of [names[3], names[1], names[0]]) if (n && canUse(b, d, n, env)) return n;
  return '파멸의 발톱';
}

/** v1.5 호환: 조건이 안 맞으면 파멸의 발톱 */
export function soloResolve(b: Battle, d: Dragon, skill: string, env: Env = { ancestors: 0, brands: [], now: 0 }): string {
  if (!EFFECT_DESC[skill]) return skill;
  return canUse(b, d, skill, env) ? skill : '파멸의 발톱';
}

// ---------------------------------------------------------------- 드래곤 행동 시작

/**
 * 드래곤 행동 시작: 턴 수를 올리고 지속 효과를 한 번씩 처리한다.
 * skip 이 true 면 이번 행동은 공격하지 않는다(label 을 전투 창에 표시).
 */
export function fxTurnStart(b: Battle, d: Dragon, rnd: () => number): { skip: boolean; label?: string } {
  const k = fxOf(b);
  const prev = k.turn++;
  let skip = false, label: string | undefined;
  const n = (t: string) => note(b, t);

  if (k.kiln !== undefined && prev < k.kiln) { heal(d, 0.03); n('가마 · 온도 콘이 휘었다 · 생명력 +3%'); }
  if (k.kiln !== undefined && k.turn >= k.kiln) { k.kiln = undefined; k.fired = true; n('가마 소성 완료 · 소성됨(받는 피해 −10%)'); }
  if (k.ink !== undefined && prev < k.ink) heal(d, 0.02);
  if (k.ink !== undefined && k.turn >= k.ink) { k.ink = undefined; n('발묵이 거두어졌다'); }
  if (k.counter !== undefined && k.turn >= k.counter) { k.counter = undefined; n('맞불 준비가 꺼졌다'); }
  if (k.graft) {
    const g = k.graft;
    hitU(b, b.units[g.unit], g.dmg, false, rnd);
    if (++g.ticks >= 3) { heal(d, 0.02); k.graft = undefined; n('접순이 열매를 맺었다 · 생명력 +2%'); }
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
    for (const [u, c] of hits) hitU(b, u, k.storm.dmg * 0.06 * c * (c > 1 ? 1.5 : 1), false, rnd);
    if (self) k.charge = Math.min(0.6, k.charge + 0.2 * self);
    const merged = [...hits.values()].some((c) => c > 1);
    n(`구전 ${3 - self}개 적중${merged ? ' · 겹쳐 터짐' : ''}${self ? ` · 폭풍 충전 +${self * 20}%` : ''}`);
  }
  if (k.storm && k.turn >= k.storm.until) k.storm = undefined;
  if (k.cave) {
    if (prev < k.cave.until) heal(d, 0.02);
    if (k.turn >= k.cave.until) {
      hitArea(b, k.cave.dmg * 0.6, rnd);
      k.cave = undefined;
      n('용암 동굴에서 분출하며 뛰쳐나왔다');
      skip = true; label = '용암 분출';
    } else { skip = true; label = '용암 동굴 속 · 회복 중'; }
  }
  if (k.ridge && k.turn > k.ridge.until) k.ridge = undefined;
  if (k.seal && k.turn >= k.seal.until) { k.seal = undefined; n('밀랍 인장이 굳어 떨어졌다'); }
  if (k.shieldUntil !== undefined && k.turn >= k.shieldUntil) { k.shield = 0; k.shieldUntil = undefined; }
  if (k.huddle !== undefined && k.turn >= k.huddle) k.huddle = undefined;

  // ---- 24개
  if (k.blood !== undefined && k.turn >= k.blood) { k.blood = undefined; n('혈통 인장이 식었다'); }
  if (k.shadow) {
    if (prev < k.shadow.until) {
      const a = alive(b);
      hitU(b, a[Math.floor(rnd() * a.length)], k.shadow.dmg * 0.4, false, rnd);
      n('선대의 그림자가 할퀴었다');
    }
    if (k.turn >= k.shadow.until) { k.shadow = undefined; n('그림자가 재로 돌아갔다'); }
  }
  if (k.grove) {
    if (prev < k.grove.until) {
      for (const u of alive(b)) hitU(b, u, k.grove.dmg * 0.1, false, rnd);
      const a = alive(b);
      const u = a[Math.floor(rnd() * a.length)];
      if (u) u.cd += 1.5;
      n('휘묻이 뿌리가 적을 묶었다');
    }
    if (k.turn >= k.grove.until) k.grove = undefined;
  }
  if (k.spot) {
    if (k.turn - k.spot.start >= 4) { k.spot = undefined; n('회전 등명이 꺼졌다'); }
    else {
      const i = litIndex(k), u = b.units[i];
      if (u && u.hp > 0) { hitU(b, u, k.spot.dmg * 0.1, false, rnd); hitU(b, u, k.spot.dmg * 0.1, false, rnd); n(`등명이 ${u.role}을(를) 비췄다 · 섬광 2번`); }
    }
  }
  if (k.fog !== undefined && k.turn >= k.fog) { k.fog = undefined; for (const e of k.e) e.revealed = false; }
  if (k.giant !== undefined) {
    if (prev < k.giant) heal(d, 0.02);
    if (k.turn >= k.giant) { k.giant = undefined; n('브로켄 그림자가 사라졌다'); }
  }
  if (k.facet !== undefined && k.turn >= k.facet) { k.facet = undefined; for (const e of k.e) e.faceted = false; }
  if (k.amber && k.turn >= k.amber.until) {
    const u = b.units[k.amber.unit], dmg = k.amber.stored * 1.2;
    k.amber = undefined;
    if (u && u.hp > 0) {
      if (dmg >= u.max * 0.5) { k.swarmReady = true; n('호박이 크게 깨졌다 · 분봉 준비'); }
      hitU(b, u, dmg, false, rnd);
      n(`호박이 깨졌다 · 모인 피해 ${Math.round(dmg)}`);
    }
  }
  if (k.swarm) {
    if (prev < k.swarm.until) {
      for (let i = 0; i < k.swarm.n; i++) { const a = alive(b); hitU(b, a[Math.floor(rnd() * a.length)], k.swarm.dmg * 0.1, false, rnd); }
    }
    if (k.turn >= k.swarm.until) { heal(d, 0.03 * k.swarm.n); n(`불벌 ${k.swarm.n}무리가 돌아왔다 · 생명력 +${k.swarm.n * 3}%`); k.swarm = undefined; }
  }
  if (k.alarm) {
    const a = k.alarm;
    if (a.hold) { a.hold = false; n('분화 경보 단계 정체'); }
    else {
      a.stage++;
      if (a.stage === 1) { for (const u of alive(b)) u.cd = 0.3 + rnd() * 3; n('분화 경보 · 초록: 적 행동 순서가 흐트러졌다'); }
      if (a.stage === 2) { k.exposed = true; n('분화 경보 · 노랑: 적 방어 −20%'); }
      if (a.stage === 3) { for (let i = 0; i < 3; i++) { const al = alive(b); hitU(b, al[Math.floor(rnd() * al.length)], a.dmg * 0.3, false, rnd); } n('분화 경보 · 주황: 화산탄 3발'); }
      if (a.stage >= 4) { hitArea(b, a.dmg * 1.2, rnd); n('분화 경보 · 빨강: 대분화!'); k.alarm = undefined; k.exposed = false; }
    }
  }
  if (k.tear !== undefined && k.turn >= k.tear) k.tear = undefined;
  if (k.loan && k.turn >= k.loan.until) {
    const L = k.loan, u = b.units[L.unit];
    k.loan = undefined;
    const e = k.e[L.unit];
    e.buffs = e.buffs.filter((x) => !(x.k === 'atk' && x.v === 0.15 && x.n >= 99));
    if (u && u.hp > 0) hitU(b, u, L.ledger * 1.2 + L.dmg * 0.8, false, rnd);
    heal(d, Math.min(0.2, (L.ledger * 0.3) / d.max));
    n(`금화 대출 만기 · 장부 ${Math.round(L.ledger)} 상환`);
  }
  if (k.auction) {
    const A = k.auction;
    if (rnd() < A.steal) {
      k.auction = undefined;
      for (let i = 0; i < b.units.length; i++) if (b.units[i].hp > 0) k.e[i].buffs.push({ k: 'atk', v: 0.15, n: 3 });
      n('적이 왕관을 먼저 가져갔다 · 적 공격 +15%');
    } else if (A.price <= 0.1 && d.hp - d.max * A.price > d.max * 0.3) {
      k.auction = undefined;
      d.hp -= d.max * A.price;
      for (const e of k.e) e.buffs = [];
      hitArea(b, lastBase(b) * 1.8, rnd);
      k.crown = k.turn + 3;
      n(`내림 경매 낙찰 (생명력 ${pct(A.price)}) · 적 버프 몰수 · 왕관`);
      skip = true; label = '왕관 낙찰';
    } else {
      A.price = Math.max(0.05, Math.round((A.price - 0.1) * 100) / 100);
      A.steal = Math.min(0.5, A.steal + 0.125);
    }
  }
  if (k.crown !== undefined && k.turn >= k.crown) k.crown = undefined;
  if (k.freeze !== undefined) {
    if (k.turn >= k.freeze) { k.freeze = undefined; for (const e of k.e) e.frost = 0; n('얼어붙은 시간이 풀렸다'); }
    else if (!skip) { skip = true; label = '얼어붙은 시간 · 서리층'; }
  }

  if (!skip && k.skip > 0) { k.skip--; skip = true; label = '숨 고르기'; }
  return { skip, label };
}
/** 마지막 기본 피해 (경매처럼 다음 턴에 터지는 효과용) */
const lastBase = (b: Battle) => b.fxBase ?? 0;

// ---------------------------------------------------------------- 드래곤 공격

/**
 * 드래곤 공격 적용 (실험 규칙 skills 일 때 기존 피해 적용 코드를 대신한다).
 * area: 이 스킬의 기본 범위 여부, focus: 전술 '집중 공격' 중인지.
 * 돌려주는 값: 전투 창에 쓸 덧붙임 문구와 실제 기준 피해.
 */
export function fxAttack(
  b: Battle, d: Dragon, skill: string, base: number, crit: boolean, area: boolean, focus: boolean, rnd: () => number,
  env?: Env, sink?: { brand?: string; heat?: number; vineAt?: number },
): { note: string; dmg: number } {
  const k = fxOf(b);
  b.fxBase = base;
  const notes: string[] = [];
  let mul = 1;
  if (k.charge > 0) { mul *= 1 + k.charge; notes.push(`충전 +${pct(k.charge)}`); k.charge = 0; }
  if (k.frostBonus) { mul *= 1.5; k.frostBonus = false; notes.push('서리층 ×1.5'); }
  if (k.kiln !== undefined) mul *= 0.85;
  const a = alive(b);
  let target: Unit | undefined = focus ? [...a].sort((x, y) => x.hp - y.hp)[0] : a[Math.floor(rnd() * a.length)];
  // 안개 막으로 드러난 적을 먼저 노린다
  const rev = a.find((u) => k.e[idx(b, u)]?.revealed);
  if (rev && !focus) { target = rev; mul *= 1.2; k.e[idx(b, rev)].revealed = false; notes.push('드러난 적 ×1.2'); }
  let spread = area && !focus;
  let passes = 1;
  let done = false; // 스킬이 피해를 직접 처리함
  const cd = COOLDOWN[skill] ?? 0;
  const sk = EFFECT_DESC[skill] && !FX.enemyOnly ? skill : null;
  if (sk && sk !== '파멸의 발톱') k.used = true;

  switch (sk) {
    // ---- 혼자 판본 12개
    case '맞불': k.counter = k.turn + 3; use(k, sk); notes.push('맞불 준비'); break;
    case '가마 소성': k.kiln = k.turn + 3; use(k, sk); notes.push('가마 변신'); break;
    case '거품 그물': k.bubble = Math.min(3, k.bubble + 1); mul *= 0.6; spread = true; use(k, sk, cd); notes.push(`거품 ${k.bubble}겹`); break;
    case '발묵': k.ink = k.turn + 3; use(k, sk); mul *= 0.5; notes.push('먹물이 번진다'); break;
    case '루비 발진': spread = true; passes = 3; mul *= 0.6; k.pump = 0; notes.push('빛 3왕복'); break;
    case '구전': k.storm = { until: k.turn + 3, dmg: base }; mul *= 0.4; use(k, sk, cd); notes.push('구전 3개'); break;
    case '용암 동굴': k.cave = { until: k.turn + 2, dmg: base }; use(k, sk); mul = 0; notes.push('동굴로 숨는다'); break;
    case '능선 박리': use(k, sk, cd); break;
    case '밀랍 봉개': k.seal = { hp: d.hp, until: k.turn + 3 }; use(k, sk); mul *= 0.5; notes.push(`인장 ${pct(d.hp / d.max)}`); break;
    case '금박 펴기': k.shield = d.max * 0.08; k.shieldUntil = k.turn + 1; use(k, sk); mul *= 0.5; notes.push('금박 보호막'); break;
    case '허들 순환': k.huddle = k.turn + 4; mul *= 0.5; use(k, sk, cd); notes.push('허들'); break;
    case '접순': mul *= 0.5; use(k, sk, cd); break;
    // ---- 흑염룡
    case '흑염 낙인': {
      use(k, sk, cd);
      spread = false;
      const foe = foeOf(b);
      if (env?.brands.includes(foe) && !k.branded) {
        k.branded = true; mul *= 1.5;
        if (b.morale !== undefined) b.morale = Math.max(0, b.morale - 10);
        notes.push('낙인 재조우 ×1.5');
      } else { mul *= 1.2; notes.push('흑염 낙인'); }
      if (sink) sink.brand = foe;
      break;
    }
    case '혈통 인장': k.blood = k.turn + 3; use(k, sk, cd); mul *= 0.6; notes.push('혈통 인장'); break;
    case '재의 기록': k.shadow = { until: k.turn + 3, dmg: base }; use(k, sk); notes.push('선대의 그림자'); break;
    // ---- 레드
    case '열 관성': {
      use(k, sk, cd);
      const h = sink?.heat ?? 0;
      mul *= 1 + 0.02 * h; spread = false;
      notes.push(`열 ${h}`);
      break;
    }
    // ---- 블루
    case '물그림자': k.decoy = 1; use(k, sk, cd); mul *= 0.5; notes.push('물그림자 분신'); break;
    // ---- 에메랄드
    case '덩굴 울타리': {
      const grown = env ? Math.min(3, env.vineAt === undefined ? 1 : Math.floor((env.now - env.vineAt) / 3600)) : 0;
      k.shield = d.max * (0.04 + 0.03 * grown); k.shieldUntil = k.turn + 3; use(k, sk); mul *= 0.5;
      if (sink) sink.vineAt = env?.now;
      notes.push(`덩굴 울타리 ${grown}단계`);
      break;
    }
    case '휘묻이 숲': k.grove = { until: k.turn + 3, dmg: base }; use(k, sk); notes.push('휘묻이 숲'); break;
    // ---- 백은
    case '회전 등명': {
      const order = b.units.map((_, i) => i).filter((i) => b.units[i].hp > 0);
      k.spot = { order, start: k.turn, dmg: base }; use(k, sk, cd); mul *= 0.6; spread = false;
      target = b.units[order[0]];
      notes.push(`등명 순서 ${order.map((i) => b.units[i].role).join('→')}`);
      break;
    }
    case '안개 막': k.fog = k.turn + 3; use(k, sk, cd); mul *= 0.5; notes.push('안개 막'); break;
    case '브로켄 강림': k.giant = k.turn + 3; use(k, sk); notes.push('브로켄 그림자'); break;
    // ---- 루비
    case '성채': k.crystals = 0; spread = true; use(k, sk, cd); notes.push('여섯 줄기 별빛'); break;
    case '패싯 전반사': k.facet = k.turn + 3; use(k, sk, cd); mul *= 0.5; notes.push('패싯'); break;
    // ---- 호박
    case '호박 봉입': {
      const t = a[Math.floor(rnd() * a.length)];
      if (t) { target = t; k.amber = { unit: idx(b, t), until: k.turn + 2, stored: 0 }; }
      spread = false; use(k, sk, cd); notes.push(`${t?.role ?? '적'} 봉입`);
      break;
    }
    case '분봉': k.swarm = { n: 3, until: k.turn + 3, dmg: base }; k.swarmReady = false; use(k, sk); notes.push('분봉 · 불벌 3무리'); break;
    // ---- 화산
    case '내리막 화쇄류': {
      use(k, sk, cd);
      const ratio = (u: Unit) => u.hp / u.max;
      let cur = [...a].sort((x, y) => ratio(y) - ratio(x))[0];
      let m = 0.5, hops = 0;
      while (cur && hops < 3) {
        const r0 = ratio(cur); // 맞기 전 비율보다 낮은 적으로만 흘러간다 (내리막)
        hitU(b, cur, base * mul * m, false, rnd);
        hops++; m *= 0.7;
        cur = alive(b).filter((u) => u !== cur && ratio(u) < r0).sort((x, y) => ratio(y) - ratio(x))[0];
      }
      notes.push(`화쇄류 ${hops}곳`);
      done = true;
      break;
    }
    case '분화 경보': k.alarm = { stage: 0, stalls: 0, dmg: base }; use(k, sk); notes.push('분화 경보 발령'); break;
    // ---- 흑요석
    case '정밀 절제': {
      use(k, sk, cd);
      const t = [...a].sort((x, y) => buffCount(k.e[idx(b, y)]) - buffCount(k.e[idx(b, x)]))[0];
      if (t) {
        const e = k.e[idx(b, t)];
        const cut = Math.min(2, e.buffs.length);
        e.buffs.splice(0, cut);
        e.noBuff = k.turn + 2;
        mul *= 1 + 0.35 * cut; target = t; spread = false;
        notes.push(`버프 ${cut}개 절제`);
      }
      break;
    }
    case '루퍼트의 눈물': k.tear = k.turn + 3; use(k, sk, cd); mul *= 0.5; notes.push('루퍼트의 눈물 자세'); break;
    // ---- 황금
    case '금화 대출': {
      const t = [...a].sort((x, y) => enemyAtk(b, idx(b, x)) - enemyAtk(b, idx(b, y)))[0];
      if (t) {
        const i = idx(b, t);
        k.loan = { unit: i, until: k.turn + 2, ledger: 0, dmg: base };
        k.e[i].buffs.push({ k: 'atk', v: 0.15, n: 99 });
        target = t;
      }
      use(k, sk, cd); mul *= 0.5; spread = false; notes.push(`${t?.role ?? '적'}에게 금화 대출`);
      break;
    }
    case '내림 경매': k.auction = { price: 0.3, steal: 0 }; use(k, sk); mul *= 0.5; notes.push('내림 경매 개시 · 낙찰가 30%'); break;
    // ---- 서리
    case '눈사태 유도': {
      const snow = Math.min(4, k.turn - k.snow);
      k.snow = k.turn;
      if (snow >= 4) { spread = true; mul *= 1.5; for (const u of a) u.cd += 1; notes.push('눈사태 · 적 전체 행동 늦춤'); }
      else { spread = false; mul *= 1.4; if (target) target.cd += 1; notes.push(`눈 ${snow}턴`); }
      break;
    }
    case '얼어붙은 시간': k.freeze = k.turn + 2; use(k, sk); mul = 0; notes.push('얼어붙은 시간'); break;
    // ---- 폭풍
    case '선행 방전': {
      use(k, sk, cd);
      const t = [...a].sort((x, y) => enemyAtk(b, idx(b, y)) - enemyAtk(b, idx(b, x)))[0];
      if (t) {
        const e = k.e[idx(b, t)];
        e.buffs = e.buffs.filter((x) => x.k !== 'atk');
        e.weak = 2; target = t;
      }
      spread = false; mul *= 1.05; notes.push(`선행 방전 → ${t?.role ?? '적'}`);
      break;
    }
    case '회로 차단기': k.breaker = 3; use(k, sk); mul *= 0.5; notes.push('회로 차단기 켬'); break;
    default: break;
  }

  // 흑요석 능선: 걸려 있는 동안 단일 공격은 능선 적을 노리고 쌓인다. 범위 공격은 끊는다.
  if (k.ridge && skill !== '능선 박리' && !done) {
    if (spread) { k.ridge = undefined; notes.push('능선 끊김'); }
    else {
      const u = b.units[k.ridge.unit];
      if (u && u.hp > 0) { target = u; k.ridge.hits++; mul *= 1 + 0.1 * k.ridge.hits; notes.push(`능선 +${k.ridge.hits}`); }
    }
  }

  const dmg = base * mul;
  if (!done) {
    if (spread) for (let i = 0; i < passes; i++) hitArea(b, dmg, rnd);
    else hitU(b, target, dmg, true, rnd);
  }

  if (skill === '능선 박리' && target) {
    k.ridge = { unit: idx(b, target), until: k.turn + 2, hits: 0 };
    notes.push('능선');
  }
  if (k.ridge) {
    const u = b.units[k.ridge.unit];
    if (u && u.hp <= 0) {
      const next = alive(b).sort((x, y) => x.hp - y.hp)[0];
      k.ridge = next ? { ...k.ridge, unit: idx(b, next), hits: Math.floor(k.ridge.hits / 2) } : undefined;
      if (next) notes.push('능선 이월');
    }
  }
  if (skill === '접순' && target) k.graft = { unit: idx(b, target), dmg: base * 0.05, ticks: 0 };
  // 블루: 거품을 감아 둔 뒤의 단일 공격이 거품을 터뜨린다
  if (d.species === 2 && !spread && k.bubble > 0 && skill !== '거품 그물') {
    for (const u of alive(b)) if (u !== target) hitU(b, u, dmg * 0.1 * k.bubble, false, rnd);
    notes.push(`거품 ${k.bubble}겹 터짐`);
    k.bubble = 0;
  }
  // 루비: 공격마다 펌핑
  if (d.species === 5 && skill !== '루비 발진' && mul > 0) k.pump = Math.min(9, k.pump + (crit ? 2 : 1));
  return { note: notes.join(' · '), dmg: done ? base : dmg * passes };
}
/** v1.5 이름 */
export const soloAttack = fxAttack;
export const soloTurnStart = fxTurnStart;

// ---------------------------------------------------------------- 적 행동

export interface EnemyMove {
  /** false 면 이번에는 공격하지 않는다 */
  act: boolean;
  /** 공격 배율 (역할·버프·큰 공격 포함) */
  mul: number;
  area: boolean;
  big: boolean;
  /** act false 일 때 다음 행동까지 (초). 없으면 평소대로 */
  cd?: number;
}

/** 적 한 명이 행동할 차례. 치유사 회복은 엔진에서 따로 처리한다 */
export function fxEnemyAct(b: Battle, i: number, rnd: () => number): EnemyMove {
  const k = fxOf(b), u = b.units[i], e = k.e[i];
  const no = (cd?: number): EnemyMove => ({ act: false, mul: 0, area: false, big: false, cd });
  if (k.amber?.unit === i) return no();
  if (e.skipNext > 0) { e.skipNext--; return no(); }
  // 얼어붙은 시간: 적이 행동할 때마다 서리층, 3층이면 다음 행동을 건너뛴다
  if (k.freeze !== undefined) {
    e.frost++;
    if (e.frost >= 3) { e.frost = 0; e.skipNext++; k.frostBonus = true; note(b, `${u.role}이(가) 서리 3층에 얼어붙었다`); }
  }
  // 버프 지속은 그 적의 행동 수로 센다
  for (const x of e.buffs) if (x.n < 99) x.n--;
  e.buffs = e.buffs.filter((x) => x.n > 0);

  // 큰 공격 예고: 용사는 공격 3번마다 힘을 모은 뒤 범위로 크게 친다
  if (u.role === '용사') {
    if (e.charge) {
      e.charge = false;
      const m = enemyAtk(b, i) / (ROLE_ATK.용사) * BIG_MUL;
      if (e.weak > 0) e.weak--;
      return { act: true, mul: m, area: true, big: true };
    }
    if (++e.acts % 3 === 0) {
      e.charge = true;
      note(b, `${b.kind === 'monster' ? '우두머리' : '용사'}가 힘을 모은다 (큰 공격 예고)`);
      return no(TELEGRAPH);
    }
  }
  // 적 버프: 창기사는 방진(받는 피해 −25%), 마법사는 축복(아군 하나 공격 +20%)
  const canBuff = (x: EnemyFx) => x.noBuff === undefined || x.noBuff <= k.turn;
  if (u.role === '창기사' && canBuff(e) && !e.buffs.some((x) => x.k === 'def') && rnd() < 0.15) {
    e.buffs.push({ k: 'def', v: 0.25, n: 3 });
    note(b, '창기사가 방진을 짰다 (받는 피해 −25%)');
    return no();
  }
  if (u.role === '마법사' && rnd() < 0.15) {
    const pool = b.units.map((x, j) => j).filter((j) => b.units[j].hp > 0 && canBuff(k.e[j]) && !k.e[j].buffs.some((x) => x.k === 'atk' && x.n < 99));
    const j = pool[Math.floor(rnd() * pool.length)];
    if (j !== undefined) {
      k.e[j].buffs.push({ k: 'atk', v: 0.2, n: 3 });
      note(b, `마법사가 ${b.units[j].role}에게 축복을 걸었다 (공격 +20%)`);
      return no();
    }
  }
  const m = enemyAtk(b, i);
  if (e.weak > 0) e.weak--;
  return { act: true, mul: m, area: AREA_ROLE.has(u.role), big: false };
}

/** 적 공격이 드래곤에게 닿기 전 보정. 돌려주는 값: 실제 피해 */
export function fxIncoming(b: Battle, d: Dragon, dmg: number, big: boolean, rnd: () => number, area = false, from = -1): number {
  const k = fxOf(b);
  const e = from >= 0 ? k.e[from] : undefined;
  if (k.cave) return 0;
  if (k.guard) { dmg *= 0.85; k.guard = false; note(b, '봉합 자리가 첫 공격을 버텼다 (−15%)'); }
  if (k.ink !== undefined && rnd() < 0.35) { note(b, '먹물에 가려 적 공격이 빗나갔다'); return 0; }
  if (!area) {
    if (k.decoy > 0) { k.decoy--; note(b, '물그림자가 대신 맞았다'); return 0; }
    if (k.fog !== undefined && rnd() < 0.15) { if (e) e.revealed = true; note(b, '안개 속 가짜 실루엣을 쳤다 · 적이 드러났다'); return 0; }
    if (k.blood !== undefined && rnd() < 0.2) { note(b, '혈통 인장이 공격을 막았다'); return 0; }
  }
  if (k.counter !== undefined && big) {
    dmg *= 0.7; k.counter = undefined; k.counterNext = true; k.skip++;
    note(b, '맞불 발동 · 큰 공격 피해 −30%');
  } else if (k.counterNext) { dmg *= 0.85; k.counterNext = false; }
  if (k.kiln !== undefined) dmg *= 0.7;
  else if (k.fired) dmg *= 0.9;
  if (k.huddle !== undefined) dmg *= d.hp <= d.max * 0.5 ? 0.75 : 0.9;
  if (k.giant !== undefined) dmg *= 0.9;
  if (k.crown !== undefined) dmg *= 0.8;
  if (k.freeze !== undefined) dmg *= 0.5;
  if (k.facet !== undefined && e) {
    if (e.faceted) {
      dmg *= 0.9;
      const u = b.units[from];
      if (u && u.hp > 0) u.hp = Math.max(0, u.hp - dmg * 0.1);
    } else e.faceted = true;
  }
  if (k.tear !== undefined) {
    if (area) {
      dmg *= 1.3; k.tear = undefined; k.skip++;
      for (const u of alive(b)) hitU(b, u, (b.fxBase ?? 0) * 0.8 / Math.max(1, alive(b).length) * 1.4, false, rnd);
      note(b, '루퍼트의 눈물이 산산조각 · 파편이 적에게 박혔다');
    } else dmg *= 0.85;
  }
  if (k.swarm && area && k.swarm.n > 0) { k.swarm.n--; note(b, '불벌 한 무리가 흩어졌다'); }
  if (k.shield > 0) {
    const absorbed = Math.min(k.shield, dmg);
    k.shield -= absorbed; dmg -= absorbed;
    if (k.shield <= 0) { k.shieldUntil = undefined; note(b, '보호막이 다 벗겨졌다'); }
  }
  if (k.breaker > 0 && dmg > d.max * 0.3) {
    dmg = d.max * 0.3; k.breaker--; k.skip++;
    note(b, `회로 차단기가 끊었다 (남은 ${k.breaker}번)`);
  }
  if (k.loan && from === k.loan.unit) k.loan.ledger += dmg;
  if (k.alarm && dmg > d.max * 0.2 && k.alarm.stalls < 2) { k.alarm.stalls++; k.alarm.hold = true; }
  if (d.species === 5) {
    if (dmg > d.max * 0.08) k.pump = Math.max(0, k.pump - 1);
    if (dmg > 0) k.crystals = Math.min(3, k.crystals + 1);
  }
  return dmg;
}
export const soloIncoming = fxIncoming;

/** 피해를 받은 직후: 밀랍 인장 판정 */
export function fxAfterHit(b: Battle, d: Dragon) {
  const k = fxOf(b);
  if (!k.seal) return;
  if (d.hp <= 0) { d.hp = Math.max(1, k.seal.hp * 0.7); k.seal = undefined; note(b, '밀랍 인장이 쓰러짐을 막았다'); }
  else if (d.hp <= k.seal.hp - d.max * 0.25) { d.hp = k.seal.hp; k.seal = undefined; note(b, '밀랍 인장 · 생명력을 기록값으로 되돌렸다'); }
}
export const soloAfterHit = fxAfterHit;

// ---------------------------------------------------------------- 표시

/** 전투 창 표시용: 지금 걸려 있는 효과 */
export function fxStatus(b: Battle): string[] {
  const k = b.fx;
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
  if (k.shield > 0) out.push(`보호막 ${Math.round(k.shield)}`);
  if (k.huddle !== undefined) out.push(`허들 ${left(k.huddle)}턴`);
  if (k.blood !== undefined) out.push(`혈통 인장 ${left(k.blood)}턴`);
  if (k.shadow) out.push(`그림자 ${left(k.shadow.until)}턴`);
  if (k.decoy > 0) out.push(`물그림자 ${k.decoy}`);
  if (k.grove) out.push(`휘묻이 숲 ${left(k.grove.until)}턴`);
  if (k.spot) out.push(`등명 ${4 - (k.turn - k.spot.start)}턴`);
  if (k.fog !== undefined) out.push(`안개 막 ${left(k.fog)}턴`);
  if (k.giant !== undefined) out.push(`브로켄 ${left(k.giant)}턴`);
  if (k.crystals) out.push(`결정 ${k.crystals}/3`);
  if (k.facet !== undefined) out.push(`패싯 ${left(k.facet)}턴`);
  if (k.amber) out.push(`호박 봉입 ${Math.round(k.amber.stored)}`);
  if (k.swarm) out.push(`불벌 ${k.swarm.n}무리`);
  if (k.alarm) out.push(`분화 경보 ${['', '초록', '노랑', '주황'][k.alarm.stage] || '발령'}`);
  if (k.tear !== undefined) out.push(`루퍼트 ${left(k.tear)}턴`);
  if (k.loan) out.push(`장부 ${Math.round(k.loan.ledger)}`);
  if (k.auction) out.push(`경매 ${pct(k.auction.price)} · 선점 ${pct(k.auction.steal)}`);
  if (k.crown !== undefined) out.push(`왕관 ${left(k.crown)}턴`);
  if (k.freeze !== undefined) out.push(`얼어붙은 시간 ${left(k.freeze)}턴`);
  if (k.breaker > 0) out.push(`차단기 ${k.breaker}`);
  const charging = k.e.findIndex((e, i) => e.charge && b.units[i]?.hp > 0);
  if (charging >= 0) out.push('⚠ 큰 공격 예고');
  const buffs = k.e.reduce((n, e, i) => n + (b.units[i]?.hp > 0 ? e.buffs.length : 0), 0);
  if (buffs) out.push(`적 버프 ${buffs}`);
  return out;
}
export const soloStatus = fxStatus;
