// 게임 엔진: 웹 버전 규칙을 실시간 방치형에 맞게 옮긴 순수 로직. 화면·파일 접근 없음.
import { skillsOf, findSkill } from './skills';
import { SOLO, soloTurnStart, soloResolve, soloAttack, soloIncoming, soloAfterHit, type SoloState } from './skillfx';
import {
  T, RATE, TIME_SCALE, SPECIES, GRADES, GRADE_MULT, REGIONS, START_TOWNS, NEW_TOWNS, ROLES,
} from './data';

export type MissionKind = 'hunt' | 'support' | 'migrate' | 'return' | 'revenge';
export type BattleKind = 'monster' | 'encounter' | 'support' | 'revenge' | 'raid' | 'duel';

export interface Mission {
  kind: MissionKind;
  target: number;
  left: number;
  total: number;
  force?: number;
  /** 출발지 (지도 표시용) */
  from?: Place;
}

export interface Place { type: 'lair' | 'region' | 'town'; index: number }

/** 임무의 목적지 */
export function missionTarget(m: Mission): Place {
  if (m.kind === 'hunt') return { type: 'region', index: m.target };
  if (m.kind === 'revenge') return { type: 'town', index: m.target };
  return { type: 'lair', index: m.target };
}

export interface Dragon {
  id: string;
  name: string;
  species: number;
  second?: number;
  grade: number;
  level: number;
  xp: number;
  age: number;
  hp: number;
  max: number;
  power: number;
  energy: number;
  injury: number;
  home: number;
  generation: number;
  parent?: string;
  born: number;
  laid: number;
  matured?: boolean;
  revenge?: boolean;
  dead?: boolean;
  diedAt?: number;
  mission?: Mission;
  // ---- 성장 콘텐츠 (테스트판) ----
  /** 전투 승리 수 (칭호) */
  wins?: number;
  /** 수련 횟수: 근력(공격력), 비늘(생명력), 날개(이동 시간) */
  train?: { power: number; scale: number; wing: number };
  /** 각성(등급 승급) 횟수 */
  awakened?: number;
  /** 자동 사냥: 지역 번호, -1 = 알아서. 없으면 꺼짐 */
  auto?: number;
  /** 연속 패배·후퇴 수 (자동 사냥 신중 모드) */
  streak?: number;
  /** 마지막으로 쓰다듬은 게임 시각 */
  petAt?: number;
  /** 마지막 전투 (바탕화면 귀환 대사용) */
  last?: { place: string; won: boolean };
}

export type RuleKey = 'defense' | 'depletion' | 'parallel' | 'tactics' | 'skills';
export const RULES: [RuleKey, string, string][] = [
  ['defense', '레어 총력 방어', '습격 때 레어의 건강한 성체(최대 3)가 함께 싸워 수호자의 공격력은 오르고 받는 피해는 나뉜다. 수호자는 위급하면 물러나고, 함락 피해도 절반'],
  ['depletion', '사냥터 고갈', '같은 사냥터에서 이길수록 유물이 줄고(−25%씩, 최소 15%) 1시간에 걸쳐 회복된다. 알아서 사냥은 풍요로운 곳을 고른다'],
  ['tactics', '전술 전투', '적에게 사기가 생겨 동료가 쓰러지거나 포효를 들으면 꺾이고, 0이 되면 달아난다(인간이 더 쉽게 무너짐). 전투 창에서 8초마다 지휘 명령(집중 공격·방어 자세·위압의 포효·후퇴)을 내릴 수 있다'],
  ['parallel', '동시 사냥', '다른 전투가 진행 중이어도 사냥터에 도착한 드래곤은 기다리지 않고 바로 싸운다(전투 화면 없이 결과만)'],
  ['skills', '종족 고유 스킬', '공통 스킬 대신 종족마다 고유 스킬(공격·방어·궁극기 + 파멸의 발톱)을 쓰고, 바탕화면·전투 창에 스킬 모션과 이펙트가 나온다. 생활 스킬은 바탕화면에서 가끔 연출된다. 지금은 이름·연출·공격 범위만 다르고 고유 효과는 아직 없다'],
];
export const rule = (s: State, k: RuleKey) => !!s.rules?.[k];
export const regionYield = (s: State, i: number) => s.yields?.[i] ?? 1;

export interface Stats { raidWins: number; duelWins: number; tributes: number; ruins: number; huntWins: number }
const stats = (s: State): Stats => (s.stats ??= { raidWins: 0, duelWins: 0, tributes: 0, ruins: 0, huntWins: 0 });

/** 업적: [id, 이름, 설명, 달성 조건]. 달성하면 유물 +50 */
export const ACHIEVEMENTS: [string, string, string, (s: State) => boolean][] = [
  ['hunt1', '첫 사냥감', '사냥에서 처음 승리한다', (s) => (s.stats?.huntWins ?? 0) >= 1],
  ['hunt50', '사냥터의 지배자', '사냥에서 50번 승리한다', (s) => (s.stats?.huntWins ?? 0) >= 50],
  ['raid5', '난공불락', '레어 습격을 5번 막아 낸다', (s) => (s.stats?.raidWins ?? 0) >= 5],
  ['duel5', '결투의 왕', '레어 앞 결투에서 5번 이긴다', (s) => (s.stats?.duelWins ?? 0) >= 5],
  ['tribute10', '두려움의 대상', '인간의 공물을 10번 받는다', (s) => (s.stats?.tributes ?? 0) >= 10],
  ['ruin1', '복수의 불길', '인간 마을을 처음 초토화한다', (s) => (s.stats?.ruins ?? 0) >= 1],
  ['gen5', '이어지는 혈통', '5세대 흑염룡이 태어난다', (s) => s.dragons.some((d) => d.species === 0 && d.generation >= 5)],
  ['lord', '군주의 탄생', '군주 등급 이상의 드래곤을 둔다', (s) => s.dragons.some((d) => !d.dead && d.home === 0 && d.grade >= 3)],
  ['crowd', '붐비는 레어', '내 레어에 드래곤 10마리가 함께 산다', (s) => s.dragons.filter((d) => !d.dead && d.home === 0).length >= 10],
  ['legend', '전설', '한 드래곤이 60번 승리한다', (s) => s.dragons.some((d) => (d.wins ?? 0) >= 60)],
];

function checkAchievements(s: State, ctx: Ctx) {
  const got = (s.achievements ??= []);
  for (const [id, name, , ok] of ACHIEVEMENTS) {
    if (got.includes(id) || !ok(s)) continue;
    got.push(id);
    s.resources += 50;
    log(s, ctx, `업적 달성 · ‘${name}’ 유물 +50`, 'train');
  }
}

/** 둥지 장식: [id, 이름, 유물, 효과 설명] */
export const DECOR: [string, string, number, string][] = [
  ['torch', '횃불 한 쌍', 80, '밤에도 둥지가 밝다'],
  ['hoard', '보물 더미', 150, '인간 사절단의 공물 +20%'],
  ['banner', '혈통의 깃발', 120, '음유시인이 더 자주 찾아온다'],
  ['crystal', '마력 수정', 220, '레어에서 쉬는 드래곤의 생명력 회복 +15%'],
];
export const hasDecor = (s: State, id: string) => !!s.decor?.includes(id);
/** 쓰다듬기 대기 (게임 초) */
export const PET_COOLDOWN = 600;
/** 바탕화면 몬스터 퇴치 보상: 기절시킬 때마다 유물 1, 게임 하루(1시간)에 20번까지 */
export const BOUNTY_MAX = 20;

export type TrainStat = 'power' | 'scale' | 'wing';
export const TRAIN_LABEL: Record<TrainStat, string> = { power: '근력', scale: '비늘', wing: '날개' };
export const WING_MAX = 5;
export const AWAKEN_MAX_GRADE = 3;

export const trainCount = (d: Dragon) => (d.train ? d.train.power + d.train.scale + d.train.wing : 0);
/** 수련 슬롯: 레벨당 1회 */
export const trainSlots = (d: Dragon) => d.level;
export const trainCost = (d: Dragon) => 20 + 12 * trainCount(d);
/** 각성 조건 레벨: 왜소→보통 Lv.6, 보통→정예 Lv.10, 정예→군주 Lv.14 */
export const awakenLevel = (d: Dragon) => 6 + d.grade * 4;
export const awakenCost = (d: Dragon) => 120 * (d.grade + 1);
/** 날개 수련에 따른 이동 시간 */
export const travelTime = (d: Dragon) => T.TRAVEL * (1 - 0.06 * Math.min(WING_MAX, d.train?.wing ?? 0));

export const TITLES: [number, string][] = [[60, '전설의 포식자'], [30, '학살자'], [15, '노련한 사냥꾼'], [5, '사냥꾼']];
export const titleOf = (d: Dragon) => TITLES.find(([n]) => (d.wins ?? 0) >= n)?.[1] ?? null;

/** 성격: id로 정해지는 고정 성향 (저장 필드 없음). 바탕화면 행동과 대사가 달라진다. */
export const PERSONALITIES = ['용맹', '느긋', '호기심', '장난꾸러기', '도도'] as const;
export type Personality = (typeof PERSONALITIES)[number];
export function personalityOf(id: string): Personality {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return PERSONALITIES[(h >>> 0) % PERSONALITIES.length];
}
export const PERSONALITY_DESC: Record<Personality, string> = {
  용맹: '하늘을 자주 날고, 조종 모드에서 먼저 나선다',
  느긋: '자주 엎드려 자고 천천히 걷는다',
  호기심: '지나가는 인간과 몬스터 쪽으로 다가가 본다',
  장난꾸러기: '다른 드래곤을 쫓아다니며 장난친다',
  도도: '혼자 둥지 근처에 머물며 말수가 적다',
};

/** 자동 사냥 '알아서' 모드가 고르는 최대 위험도 */
export const autoMaxRisk = (d: Dragon) => Math.max(1, Math.min(5, 1 + Math.floor(d.level / 4) + (d.grade >= 3 ? 1 : 0)));

export interface Egg {
  id: string;
  species: number;
  second?: number;
  left: number;
  parent?: string;
  generation: number;
}

export interface Town { name: string; army: number; ruin: number }
export interface Patrol { town: number; target: number; progress: number; duration: number; force: number }

export interface Unit { role: string; hp: number; max: number; cd: number }

export interface Battle {
  dragon: string;
  roles: string[];
  force: number;
  count: number;
  hp: number;
  max: number;
  place: string;
  kind: BattleKind;
  target: number;
  units: Unit[];
  t: number;
  dc: number;
  hc: number;
  skill: string;
  log: string[];
  phase: number;
  /** 전술 전투(실험 규칙 tactics): 적 사기 0~100, 0이 되면 무너져 달아난다 */
  morale?: number;
  /** 지휘 명령과 끝나는 전투 시각 */
  order?: { type: Command; until: number };
  /** 다음 명령을 내릴 수 있는 전투 시각 */
  orderReady?: number;
  /** 바탕화면 방어전에서 막아 낸 침입자 수 */
  defended?: number;  /** 종족 고유 스킬 '아군 필요' 12개의 혼자 판본 상태 (skillfx.ts) */
  solo?: SoloState;
}

/** 바탕화면 방어전: 습격 중 작업표시줄 위 침입자를 쫓아낼 때마다 적 전력을 깎는다 */
export const DEFEND_MAX = 15;
export const DEFEND_HIT = 0.035;

export type Command = 'focus' | 'guard' | 'roar' | 'retreat';
export const COMMANDS: [Command, string, string][] = [
  ['focus', '집중 공격', '6초 동안 가장 약한 적 하나를 노려 피해 ×1.6. 쓰러뜨리면 적 사기가 크게 꺾인다'],
  ['guard', '방어 자세', '6초 동안 받는 피해 절반, 주는 피해 ×0.6'],
  ['roar', '위압의 포효', '적 사기 −25(군주 이상 −40), 적의 다음 공격이 늦어진다'],
  ['retreat', '후퇴', '바로 물러난다. 지지만 목숨은 지킨다'],
];
export const ORDER_COOLDOWN = 8;

export type EventKind =
  | 'info' | 'name' | 'level' | 'adult' | 'hatch' | 'egg' | 'visit' | 'death'
  | 'win' | 'loss' | 'retreat' | 'return' | 'depart' | 'migrate' | 'support'
  | 'raid' | 'fall' | 'town' | 'ruin' | 'over' | 'talk' | 'human' | 'train';

/** 인간 방문 종류 (바탕화면 연출용) */
export type HumanVisit = 'tribute' | 'bard' | 'challenger' | 'pilgrim';

export interface WorldEvent { time: number; text: string; kind: EventKind }

export interface SupportPrompt {
  kind: 'support';
  target: number;
  known: boolean;
  force: number;
  expires: number;
}

export interface State {
  format: 'blackflame-desktop';
  version: 1;
  started: boolean;
  time: number;
  seed: number;
  dragons: Dragon[];
  eggs: Egg[];
  relations: number[];
  towns: Town[];
  patrols: Patrol[];
  events: WorldEvent[];
  prompt: SupportPrompt | null;
  battle: Battle | null;
  resources: number;
  nextEvent: number;
  nextTalk?: number;
  /** 다음 인간 방문 시각 (테스트판) */
  nextHuman?: number;
  /** 누적 기록과 달성한 업적 (테스트판) */
  stats?: Stats;
  achievements?: string[];
  /** 둥지 장식 (테스트판) */
  decor?: string[];
  /** 실험 규칙 (테스트판에서 켜고 끔). 없으면 모두 꺼짐 = 기존 규칙 */
  rules?: Partial<Record<RuleKey, boolean>>;
  /** 사냥터 풍요도 [지역] 0.2~1 (실험 규칙 depletion) */
  yields?: number[];
  /** 숙적: 결투에서 살아 돌아가 다시 도전하는 인간 영웅 */
  nemesis?: { name: string; level: number; defeats: number; wins: number };
  /** 바탕화면 몬스터 퇴치 보상: 게임 하루 단위 횟수 */
  bounty?: { day: number; count: number };
  over: boolean;
  chronicle: number;
}

/** 엔진이 바깥(알림 등)으로 내보내는 소식 */
export interface Notice { kind: EventKind; text: string; dragon?: string; human?: HumanVisit; ally?: { species: number; why: 'thanks' | 'egg'; rel?: number }; scene?: 'raid-won' | 'fall' }

export interface Ctx {
  /** 꺼져 있던 시간을 따라잡는 중이면 true: 지원 요청을 만들지 않는다 */
  offline: boolean;
  notices: Notice[];
}

export const newCtx = (offline = false): Ctx => ({ offline, notices: [] });

// ---------------------------------------------------------------- 기본 도구

export function rand(s: State): number {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}

const NOTIFY: EventKind[] = ['raid', 'hatch', 'return', 'death', 'visit', 'support', 'over', 'fall', 'human', 'ruin'];

export function log(s: State, ctx: Ctx | null, text: string, kind: EventKind = 'info', dragon?: string, human?: HumanVisit) {
  s.events.unshift({ time: s.time, text, kind });
  if (s.events.length > 300) s.events.length = 300;
  if (ctx && NOTIFY.includes(kind)) ctx.notices.push({ kind, text, dragon, human });
}

export const isAdult = (d: Dragon) => d.age >= T.ADULT_AGE && d.level >= 3;

export function guardian(s: State): Dragon | undefined {
  return s.dragons
    .filter((d) => !d.dead && d.species === 0 && isAdult(d))
    .sort((a, b) => a.born - b.born)[0];
}

function autoName(s: State, generation: number) {
  return `흑염룡 · ${generation}세대 · ${s.seed.toString(36).slice(0, 3)}`;
}

export function makeDragon(s: State, species: number, generation = 1, parent?: string): Dragon {
  const r = rand(s);
  const grade = r < 0.002 ? 4 : r < 0.07 ? 3 : r < 0.3 ? 2 : r < 0.9 ? 1 : 0;
  const mult = GRADE_MULT[grade];
  const hp = Math.round(300 * mult);
  return {
    id: 'd' + s.seed,
    name: species === 0 ? autoName(s, generation) : SPECIES[species] + ' · ' + s.seed.toString(36).slice(0, 3),
    species,
    grade,
    level: 1,
    xp: 0,
    age: 0,
    hp,
    max: hp,
    power: Math.round(24 * mult),
    energy: 100,
    injury: 0,
    home: 0,
    generation,
    parent,
    born: s.time,
    laid: 0,
  };
}

/** 새 연대기. 첫 흑염룡 이름을 받기 전까지 started=false 라서 시간이 흐르지 않는다. */
export function newState(seed: number, chronicle = 1): State {
  const s: State = {
    format: 'blackflame-desktop',
    version: 1,
    started: false,
    time: 0,
    seed: seed >>> 0,
    dragons: [],
    eggs: [],
    relations: SPECIES.map(() => 35),
    towns: START_TOWNS.map((t) => ({ ...t, ruin: 0 })),
    patrols: [],
    events: [],
    prompt: null,
    battle: null,
    resources: 0,
    nextEvent: T.FIRST_EVENT,
    over: false,
    chronicle,
  };
  const first = makeDragon(s, 0);
  first.name = '';
  first.age = T.START_AGE_BLACK;
  first.level = 3;
  first.max += 120;
  first.hp = first.max;
  first.power += 12;
  first.matured = true;
  s.dragons.push(first);
  for (let i = 1; i < SPECIES.length; i++) {
    const d = makeDragon(s, i);
    d.age = T.START_AGE_OTHER;
    d.level = 4;
    d.home = i;
    d.matured = true;
    s.dragons.push(d);
  }
  s.patrols = s.towns.map((t, i) => ({ town: i, target: i, progress: 0, duration: T.PATROL, force: t.army * 0.15 }));
  log(s, null, '흑염룡의 혈통이 황혼의 레어에 깃들었다.');
  return s;
}

// ---------------------------------------------------------------- 명령

export type Action =
  | { type: 'start'; name: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'hunt'; id: string; target: number }
  | { type: 'support'; accept: boolean }
  | { type: 'train'; id: string; stat: TrainStat }
  | { type: 'awaken'; id: string }
  | { type: 'auto'; id: string; region: number | null }
  | { type: 'decor'; item: string }
  | { type: 'pet'; id: string }
  | { type: 'bounty' }
  | { type: 'rule'; key: RuleKey; on: boolean }
  | { type: 'command'; order: Command }
  | { type: 'defend' };

/** 수련·각성은 내 레어에서 쉬고 있을 때만 */
function atLair(s: State, d: Dragon | undefined): string | null {
  if (!d) return '드래곤을 선택하세요';
  if (d.dead) return '세상을 떠난 드래곤입니다';
  if (d.home !== 0) return '다른 레어의 드래곤입니다';
  if (d.mission) return '이동 중입니다';
  if (s.battle?.dragon === d.id) return '전투 중입니다';
  return null;
}

export function canTrain(s: State, d: Dragon | undefined, stat: TrainStat): string | null {
  const why = atLair(s, d);
  if (why) return why;
  if (trainCount(d!) >= trainSlots(d!)) return `수련 슬롯이 없습니다 (레벨당 1회, ${trainCount(d!)}/${trainSlots(d!)})`;
  if (stat === 'wing' && (d!.train?.wing ?? 0) >= WING_MAX) return `날개 수련은 ${WING_MAX}회까지입니다`;
  if (s.resources < trainCost(d!)) return `유물이 부족합니다 (${trainCost(d!)} 필요)`;
  return null;
}

export function canAwaken(s: State, d: Dragon | undefined): string | null {
  const why = atLair(s, d);
  if (why) return why;
  if (d!.grade >= AWAKEN_MAX_GRADE) return d!.grade === 4 ? '이미 패왕입니다' : '군주 등급은 더 각성할 수 없습니다';
  if (d!.level < awakenLevel(d!)) return `Lv.${awakenLevel(d!)}부터 각성할 수 있습니다`;
  if (s.resources < awakenCost(d!)) return `유물이 부족합니다 (${awakenCost(d!)} 필요)`;
  return null;
}

export function canHunt(s: State, d: Dragon | undefined): string | null {
  if (!d) return '드래곤을 선택하세요';
  if (d.dead) return '세상을 떠난 드래곤입니다';
  if (d.home !== 0) return '다른 레어의 드래곤입니다';
  if (d.mission) return '이동 중입니다';
  if (s.battle?.dragon === d.id) return '전투 중입니다';
  if (d.hp <= d.max * 0.25) return '생명력이 25% 이하입니다';
  if (d.energy < 30) return '기력이 30 미만입니다';
  return null;
}

export function act(s: State, a: Action, ctx: Ctx | null = null): string | null {
  if (a.type === 'start') {
    const name = a.name.trim().slice(0, 18);
    if (!name) return '이름을 입력하세요';
    const first = s.dragons[0];
    first.name = name;
    s.started = true;
    log(s, ctx, `${name} — 1세대 흑염룡의 이름이 기록되었다.`, 'name');
    return null;
  }
  if (a.type === 'rename') {
    const d = s.dragons.find((x) => x.id === a.id);
    const name = a.name.trim().slice(0, 18);
    if (!d || !name) return '이름을 입력하세요';
    const old = d.name;
    d.name = name;
    log(s, ctx, `${old} → ${name}, 새 이름이 기록되었다.`, 'name');
    return null;
  }
  if (a.type === 'hunt') {
    const d = s.dragons.find((x) => x.id === a.id);
    const why = canHunt(s, d);
    if (why) return why;
    if (!Number.isInteger(a.target) || !REGIONS[a.target]) return '지역을 선택하세요';
    depart(s, ctx, d!, a.target, false);
    return null;
  }
  if (a.type === 'support') {
    resolveSupport(s, a.accept, ctx, false);
    return null;
  }
  if (a.type === 'train') {
    const d = s.dragons.find((x) => x.id === a.id);
    if (!['power', 'scale', 'wing'].includes(a.stat)) return '수련 종류를 고르세요';
    const why = canTrain(s, d, a.stat);
    if (why) return why;
    s.resources -= trainCost(d!);
    d!.train = d!.train ?? { power: 0, scale: 0, wing: 0 };
    d!.train[a.stat]++;
    if (a.stat === 'power') d!.power += 6;
    else if (a.stat === 'scale') { d!.max += 40; d!.hp += 40; }
    log(s, ctx, `${d!.name}, ${TRAIN_LABEL[a.stat]} 수련 완료.${a.stat === 'power' ? ' 공격력 +6' : a.stat === 'scale' ? ' 생명력 +40' : ' 이동 시간 −6%'}`, 'train', d!.id);
    return null;
  }
  if (a.type === 'awaken') {
    const d = s.dragons.find((x) => x.id === a.id);
    const why = canAwaken(s, d);
    if (why) return why;
    s.resources -= awakenCost(d!);
    const k = GRADE_MULT[d!.grade + 1] / GRADE_MULT[d!.grade];
    d!.grade++;
    d!.awakened = (d!.awakened ?? 0) + 1;
    d!.max = Math.round(d!.max * k);
    d!.hp = d!.max;
    d!.power = Math.round(d!.power * k);
    d!.injury = 0;
    log(s, ctx, `${d!.name}, 각성! ${GRADES[d!.grade]} 등급에 올랐다.`, 'train', d!.id);
    return null;
  }
  if (a.type === 'decor') {
    const it = DECOR.find(([id]) => id === a.item);
    if (!it) return '장식을 고르세요';
    if (hasDecor(s, it[0])) return '이미 있습니다';
    if (s.resources < it[2]) return `유물이 부족합니다 (${it[2]} 필요)`;
    s.resources -= it[2];
    (s.decor ??= []).push(it[0]);
    log(s, ctx, `둥지에 ${it[1]}을(를) 들였다.`, 'train');
    return null;
  }
  if (a.type === 'defend') {
    const b = s.battle;
    if (!b || b.kind !== 'raid') return '레어 습격 중이 아닙니다';
    if ((b.defended ?? 0) >= DEFEND_MAX) return '이번 습격에서 막을 수 있는 만큼 막았습니다';
    b.defended = (b.defended ?? 0) + 1;
    for (const u of b.units) if (u.hp > 0) u.hp = Math.max(1, u.hp - u.max * DEFEND_HIT);
    b.hp = b.units.reduce((n, u) => n + Math.max(0, u.hp), 0);
    if (b.morale !== undefined) b.morale = Math.max(0, b.morale - 5);
    b.log.unshift(`바탕화면 방어전 · 침입자 격퇴 (${b.defended}/${DEFEND_MAX})`);
    return null;
  }
  if (a.type === 'command') {
    const b = s.battle;
    if (!b) return '전투 중이 아닙니다';
    if (!rule(s, 'tactics')) return '전술 전투 규칙이 꺼져 있습니다';
    if (!COMMANDS.some(([k]) => k === a.order)) return '알 수 없는 명령';
    if ((b.orderReady ?? 0) > b.t) return `${Math.ceil((b.orderReady ?? 0) - b.t)}초 뒤에 다시 명령할 수 있습니다`;
    const d = s.dragons.find((x) => x.id === b.dragon)!;
    b.orderReady = b.t + ORDER_COOLDOWN;
    const name = COMMANDS.find(([k]) => k === a.order)![1];
    b.log.unshift(`▶ 명령: ${name}`);
    if (a.order === 'retreat') {
      log(s, ctx, `${d.name}, 명령에 따라 물러났다.`, 'info', d.id);
      endBattle(s, ctx ?? newCtx(), false, true);
      return null;
    }
    if (a.order === 'roar') {
      const loss = d.grade >= 3 ? 40 : 25;
      b.morale = Math.max(0, (b.morale ?? 100) - loss * moraleFactor(b));
      for (const u of b.units) u.cd += 1.5;
      b.skill = '위압의 포효!';
      return null;
    }
    b.order = { type: a.order, until: b.t + 6 };
    return null;
  }
  if (a.type === 'rule') {
    if (!RULES.some(([k]) => k === a.key)) return '알 수 없는 규칙';
    (s.rules ??= {})[a.key] = !!a.on;
    log(s, ctx, `실험 규칙 ‘${RULES.find(([k]) => k === a.key)![1]}’ ${a.on ? '켬' : '끔'}.`);
    return null;
  }
  if (a.type === 'bounty') {
    const day = Math.floor(s.time / T.DAY);
    if (!s.bounty || s.bounty.day !== day) s.bounty = { day, count: 0 };
    if (s.bounty.count >= BOUNTY_MAX) return '오늘 몫은 다 받았습니다';
    s.bounty.count++;
    s.resources += 1;
    return null;
  }
  if (a.type === 'pet') {
    const d = s.dragons.find((x) => x.id === a.id);
    if (!d || d.dead || d.mission) return '쓰다듬을 수 없습니다';
    if (d.petAt !== undefined && s.time - d.petAt < PET_COOLDOWN) return '방금 쓰다듬었습니다';
    d.petAt = s.time;
    d.energy = Math.min(100, d.energy + 8);
    d.xp += 5;
    return null;
  }
  if (a.type === 'auto') {
    const d = s.dragons.find((x) => x.id === a.id);
    if (!d || d.dead) return '드래곤을 선택하세요';
    if (d.home !== 0) return '다른 레어의 드래곤입니다';
    if (a.region === null) { d.auto = undefined; return null; }
    if (a.region !== -1 && !REGIONS[a.region]) return '지역을 선택하세요';
    d.auto = a.region;
    return null;
  }
  return '알 수 없는 명령';
}

function depart(s: State, ctx: Ctx | null, d: Dragon, target: number, auto: boolean) {
  const t = travelTime(d);
  d.mission = { kind: 'hunt', target, left: t, total: t };
  d.energy -= 25;
  log(s, ctx, `${d.name}, ${REGIONS[target].name} ${auto ? '자동 사냥' : '탐험'} 출발.`, 'depart', d.id);
}

/** 자동 사냥: 충분히 회복한 드래곤을 정해 둔 지역(또는 알아서 고른 지역)으로 보낸다 */
function autoHunt(s: State, ctx: Ctx, d: Dragon) {
  if (d.auto === undefined || d.dead || d.home !== 0 || d.mission || s.battle?.dragon === d.id) return;
  if (d.hp < d.max * 0.7 || d.energy < 50 || d.injury > 4) return;
  // 연달아 3번 지거나 물러난 드래곤은 완전히 회복할 때까지 쉰다
  if ((d.streak ?? 0) >= 3 && (d.hp < d.max * 0.98 || d.injury > 0.5 || d.energy < 90)) return;
  if (canHunt(s, d)) return;
  // 레어가 습격받는 중이거나 지원 요청을 기다리는 수호 흑염룡은 보내지 않는다
  if (s.battle?.kind === 'raid') return;
  if (s.prompt && guardian(s)?.id === d.id) return;
  // 레어 지킴이: 자동 사냥으로 레어가 텅 비지 않게, 다른 건강한 성체가 1마리 이상 남아 있을 때만 나간다
  const keepers = s.dragons.filter((x) => x !== d && !x.dead && x.home === 0 && !x.mission && isAdult(x) && x.hp > x.max * 0.5);
  if (!keepers.length) return;
  let target = d.auto;
  if (target === -1) {
    const max = autoMaxRisk(d);
    const ok = REGIONS.map((r, i) => ({ r, i })).filter((x) => x.r.risk <= max);
    // 위험도가 높을수록 자주 고른다 (보상이 크다)
    // 사냥터 고갈 규칙이 켜져 있으면 풍요로운 곳을 더 자주 고른다
    const w = (x: { r: { risk: number }; i: number }) => x.r.risk * (rule(s, 'depletion') ? regionYield(s, x.i) ** 2 : 1);
    const total = ok.reduce((a, x) => a + w(x), 0);
    let roll = rand(s) * total;
    target = ok[0].i;
    for (const x of ok) { roll -= w(x); if (roll <= 0) { target = x.i; break; } }
  }
  if (!REGIONS[target]) return;
  depart(s, ctx, d, target, true);
}

function resolveSupport(s: State, accept: boolean, ctx: Ctx | null, timedOut: boolean) {
  const p = s.prompt;
  if (!p) return;
  const g = guardian(s);
  if (accept && g && !g.mission && g.hp > g.max * 0.2 && s.battle?.dragon !== g.id) {
    g.mission = { kind: 'support', target: p.target, left: travelTime(g), total: travelTime(g), force: p.force };
    log(s, ctx, `${SPECIES[p.target]} 레어로 지원 출발. 왕복 이동 중 레어의 수비가 약해진다.`, 'depart');
  } else {
    s.relations[p.target] -= 8;
    log(
      s, ctx,
      timedOut
        ? `응답이 없어 ${SPECIES[p.target]} 레어의 지원 요청을 지나쳤다. 레어에 남아 수비를 지킨다.`
        : `${SPECIES[p.target]} 레어의 지원 요청을 거절했다.`,
    );
  }
  s.prompt = null;
}

// ---------------------------------------------------------------- 전투

export function startBattle(s: State, ctx: Ctx, d: Dragon, force: number, place: string, kind: BattleKind = 'monster', target = 0) {
  const count = Math.round(force);
  const roles = kind === 'duel' ? ['용사'] : ['용사', ...ROLES.slice(1).filter(() => rand(s) > 0.25)];
  s.battle = {
    dragon: d.id,
    roles,
    force,
    count,
    hp: force * 2,
    max: force * 2,
    place,
    kind,
    target,
    units: roles.map((role, i) => ({ role, hp: (force * 2) / roles.length, max: (force * 2) / roles.length, cd: 0.5 + i * 0.4 })),
    t: 0,
    dc: 0,
    hc: 1,
    skill: '전투 시작',
    log: [],
    phase: 0,
    morale: rule(s, 'tactics') ? 100 : undefined,
  };
  log(s, ctx, `${place}에서 교전 발생 · 적 ${count.toLocaleString()} 전력.`, kind === 'raid' ? 'raid' : 'info', d.id);
}

export const SKILLS = (d: Dragon, s?: State) => {
  if (s && rule(s, 'skills')) {
    // 종족 고유 스킬: 공격 · 방어 · 궁극기 + 공통 단일 공격 (생활 스킬은 바탕화면 전용)
    const k = skillsOf(d.species);
    return [k[0].name, k[1].name, k[3].name, '파멸의 발톱'];
  }
  return [
    d.species === 0 ? '흑염 브레스' : SPECIES[d.species] + '의 숨결',
    '파멸의 발톱',
    '낙성 강습',
    d.grade === 4 ? '패왕의 포효' : '용의 위압',
  ];
};

/** 이 스킬이 살아 있는 적 전체를 나눠 치는가 */
const isAreaSkill = (s: State, d: Dragon, skill: string) =>
  rule(s, 'skills') ? !!findSkill(d.species, skill)?.area : /브레스|숨결|강습/.test(skill);

function endBattle(s: State, ctx: Ctx, won: boolean, retreat = false) {
  const b = s.battle!;
  const d = s.dragons.find((x) => x.id === b.dragon)!;
  if (d.hp <= 0) {
    for (const o of s.dragons.filter((x) => !x.dead && x.species === 0 && x.id !== d.id)) o.revenge = true;
    d.dead = true;
    d.diedAt = s.time;
    d.mission = undefined;
    log(s, ctx, `${d.name} 전사. 레어의 역사에 이름을 새긴다.`, 'death', d.id);
  } else {
    d.last = { place: b.place, won };
    d.streak = won ? 0 : (d.streak ?? 0) + 1;
    d.injury += won ? 1 : 3;
    d.energy = Math.max(0, d.energy - 20);
    d.xp += won ? 100 + Math.round(rand(s) * 220) : 25;
    const from: Place = b.kind === 'monster' || b.kind === 'encounter' ? { type: 'region', index: b.target }
      : b.kind === 'support' ? { type: 'lair', index: b.target }
      : b.kind === 'revenge' ? { type: 'town', index: b.target } : { type: 'lair', index: 0 };
    // 레어 앞 결투는 이동이 없다
    d.mission = b.kind === 'duel' ? undefined : { kind: 'return', target: 0, left: travelTime(d), total: travelTime(d), from };
    log(
      s, ctx,
      b.kind === 'duel'
        ? `${d.name}, 결투에서 ${won ? '승리. 도전자는 꽁무니를 빼고 달아났다' : '물러섰다. 도전자는 의기양양하게 돌아갔다'}.`
        : `${d.name}, ${won ? '승리' : retreat ? '부상 후 후퇴' : '패배'}. 생존자는 레어로 귀환한다.`,
      won ? 'win' : retreat ? 'retreat' : 'loss', d.id,
    );
  }
  if (b.kind === 'support') {
    s.relations[b.target] += won ? 20 : 5;
    log(s, ctx, won ? '지원받은 레어가 감사의 유물과 친밀도를 전했다.' : '지원은 실패했지만 도움의 뜻은 전해졌다.');
    // 바탕화면: 도움받은 종족의 드래곤이 감사 인사를 하러 날아온다
    if (won && !ctx.offline) ctx.notices.push({ kind: 'info', text: '', ally: { species: b.target, why: 'thanks', rel: s.relations[b.target] } });
  }
  if (won) {
    s.resources += 30;
    // 사냥터 위험도에 따라 유물을 더 얻는다
    if (b.kind === 'duel') { s.resources += 10; stats(s).duelWins++; }
    if (b.kind === 'raid') stats(s).raidWins++;
    if (b.kind === 'monster' || b.kind === 'encounter') stats(s).huntWins++;
    if (b.kind === 'monster' || b.kind === 'encounter') {
      if (rule(s, 'depletion')) {
        // 사냥터 고갈: 기본 30 + 위험도 보상을 풍요도만큼만 받고, 풍요도는 줄어든다
        const y = regionYield(s, b.target);
        s.resources -= 30;
        s.resources += Math.round((30 + 5 * (REGIONS[b.target]?.risk ?? 1)) * y);
        (s.yields ??= REGIONS.map(() => 1))[b.target] = Math.max(0.15, y - 0.25);
      } else s.resources += 5 * (REGIONS[b.target]?.risk ?? 1);
    }
    if (d.hp > 0) {
      const before = titleOf(d);
      d.wins = (d.wins ?? 0) + 1;
      const after = titleOf(d);
      if (after && after !== before) log(s, ctx, `${d.name}, 승리 ${d.wins}회 · ‘${after}’ 칭호를 얻었다.`, 'train', d.id);
    }
  }
  if (b.kind === 'revenge') {
    const town = s.towns[b.target];
    town.army = Math.max(50, town.army - (won ? b.count * 0.8 : b.count * 0.2));
    if (won) {
      town.ruin = T.RUIN;
      stats(s).ruins++;
      log(s, ctx, `${town.name} 초토화. 피난민은 살아남아 재건을 시작한다.`, 'ruin');
    }
  } else if (b.kind !== 'monster' && b.kind !== 'duel') {
    const town = s.towns[b.target % s.towns.length];
    town.army = Math.max(50, town.army - b.count * (won ? 0.6 : 0.15));
  }
  if (b.kind === 'duel') duelAftermath(s, ctx, b, won);
  if (b.kind === 'raid' && !ctx.offline) ctx.notices.push({ kind: 'info', text: '', scene: won ? 'raid-won' : 'fall' });
  if (b.kind === 'raid' && !won) {
    for (const o of s.dragons.filter((x) => !x.dead && x.home === 0 && !x.mission && x.id !== d.id)) {
      o.hp -= o.max * (0.3 + rand(s)) * (rule(s, 'defense') ? 0.5 : 1);
      if (ctx.offline) o.hp = Math.max(1, o.hp);
      if (o.hp <= 0) {
        o.dead = true;
        o.diedAt = s.time;
        log(s, ctx, `${o.name}, 레어를 지키다 쓰러졌다.`, 'death', o.id);
      }
    }
    if (!ctx.offline) s.eggs = s.eggs.filter(() => rand(s) > 0.2);
    log(s, ctx, '레어가 함락되었다. 어린 용들은 약화된 브레스로 버텼지만 피해를 피하지 못했다.', 'fall');
  }
  s.battle = null;
}

/** 실험 규칙 '레어 총력 방어': 습격 때 함께 싸우는 레어 성체들 */
function defenders(s: State, d: Dragon): Dragon[] {
  if (!rule(s, 'defense') || s.battle?.kind !== 'raid') return [];
  return s.dragons.filter((x) => x !== d && !x.dead && x.home === 0 && !x.mission && isAdult(x) && x.hp > x.max * 0.3).slice(0, 3);
}

/** 사기 손실 배율: 인간 군대는 쉽게 무너지고, 몬스터는 잘 버틴다 */
const moraleFactor = (b: Battle) => (b.kind === 'monster' ? 0.5 : b.kind === 'duel' ? 0.7 : 1);

function enemyTurn(s: State, d: Dragon, b: Battle, dt: number) {
  const helpers = defenders(s, d);
  const total = s.towns.reduce((a, t) => a + t.army, 0);
  const crown = d.grade === 4 && b.force < total * 0.9 ? 0.025 : 1;
  for (const u of b.units) {
    if (u.hp <= 0) continue;
    u.cd -= dt;
    if (u.cd > 0) continue;
    u.cd = 1.7 + rand(s) * 2.3;
    if (u.role === '치유사' && b.kind !== 'monster') {
      const low = b.units.filter((x) => x.hp > 0).sort((x, y) => x.hp / x.max - y.hp / y.max)[0];
      if (low) low.hp = Math.min(low.max, low.hp + b.force * 0.012);
      b.hp = b.units.reduce((a, x) => a + Math.max(0, x.hp), 0);
      b.log.unshift('치유사가 전열을 회복했다.');
      continue;
    }
    const exposed = b.dc > 2.5;
    const crit = rand(s) < (exposed ? 0.25 : 0.04);
    const guard = b.order?.type === 'guard' && b.order.until > b.t;
    let dmg = ((b.force * 0.04) / b.units.length) * crown * (crit ? 3.5 : 1) * (u.role === '용사' ? 1.6 : 1) * (guard ? 0.5 : 1);
    if (rule(s, 'skills') && SOLO.on) dmg = soloIncoming(b, d, dmg, crit || u.role === '용사', () => rand(s));
    if (helpers.length) {
      // 피해를 나눠 받는다: 수호자 몫이 줄고, 나머지는 함께 싸우는 성체에게 (쓰러지지는 않음)
      const share = dmg / (1 + 0.5 * helpers.length);
      d.hp -= share;
      const h = helpers[Math.floor(rand(s) * helpers.length)];
      h.hp = Math.max(h.max * 0.2, h.hp - (dmg - share));
    } else d.hp -= dmg;
    if (rule(s, 'skills') && SOLO.on) {
      if (dmg <= 0) continue;
      soloAfterHit(b, d);
    }
    b.log.unshift((b.kind === 'monster' ? '몬스터' : u.role) + (crit ? ' · 노출된 약점 강타' : ' · 공격') + ' −' + Math.round(dmg));
  }
}

/** 전투는 실제 초 단위로 진행한다 (시간 배율 없음). */
export function battleStep(s: State, ctx: Ctx, dt: number) {
  const b = s.battle!;
  const d = s.dragons.find((x) => x.id === b.dragon)!;
  b.t += dt;
  b.dc -= dt;
  b.hc -= dt;
  if (b.dc <= 0) {
    b.dc = 2 + rand(s) * 2;
    const solo = rule(s, 'skills') && SOLO.on;
    const pause = solo ? soloTurnStart(b, d, () => rand(s)) : { skip: false };
    if (pause.skip) {
      // 용암 동굴 속·맞불 대가: 이번 행동은 공격하지 않는다 (모션도 다시 틀지 않도록 phase 유지)
      b.hp = b.units.reduce((a, u) => a + Math.max(0, u.hp), 0);
      b.skill = pause.label ?? '숨 고르기';
    } else {
    const crit = rand(s) < 0.18;
    let skill = SKILLS(d, s)[Math.floor(rand(s) * 4)];
    if (solo) skill = soloResolve(b, d, skill);
    const helpers = defenders(s, d);
    const ord = b.order && b.order.until > b.t ? b.order.type : null;
    const dmg = d.power * (isAdult(d) ? 1 : 0.4) * (1 - Math.min(0.4, d.injury * 0.04)) * (1 + rand(s)) * (crit ? 3 : 1) * (1 + 0.35 * helpers.length)
      * (ord === 'focus' ? 1.6 : ord === 'guard' ? 0.6 : 1);
    const alive = b.units.filter((u) => u.hp > 0);
    const before = alive.length;
    let extra = '', shown = dmg;
    if (solo) {
      const r = soloAttack(b, d, skill, dmg, crit, isAreaSkill(s, d, skill), ord === 'focus', () => rand(s));
      extra = r.note; shown = r.dmg;
    } else if (ord === 'focus') {
      // 집중 공격: 가장 약한 적 하나를 노린다
      const u = [...alive].sort((x, y) => x.hp - y.hp)[0];
      if (u) u.hp = Math.max(0, u.hp - dmg);
    } else if (isAreaSkill(s, d, skill)) {
      for (const u of alive) u.hp = Math.max(0, u.hp - (dmg / Math.max(1, alive.length)) * 1.4);
    } else {
      const u = alive[Math.floor(rand(s) * alive.length)];
      if (u) u.hp = Math.max(0, u.hp - dmg);
    }
    b.hp = b.units.reduce((a, u) => a + Math.max(0, u.hp), 0);
    if (b.morale !== undefined) {
      // 사기: 동료가 쓰러지거나 치명타를 맞으면 꺾인다
      const fallen = before - b.units.filter((u) => u.hp > 0).length;
      b.morale = Math.max(0, b.morale - (fallen * (ord === 'focus' ? 30 : 20) + (crit ? 8 : 0)) * moraleFactor(b));
    }
    b.skill = skill + (crit ? ' · 약점 관통!' : '');
    b.phase++;
    b.log.unshift(`${d.name} ${b.skill} −${Math.round(shown)}${extra ? ' · ' + extra : ''}`);
    }
  }
  enemyTurn(s, d, b, dt);
  b.log = b.log.slice(0, 6);
  if (d.hp <= 0 && ctx.offline) {
    // 꺼져 있던 동안 보호: 쓰러지기 직전에 후퇴한다
    d.hp = 1;
    endBattle(s, ctx, false, true);
  } else if (d.hp <= 0) endBattle(s, ctx, false);
  else if (b.hp <= 0) endBattle(s, ctx, true);
  else if (b.morale !== undefined && b.morale <= 0) {
    log(s, ctx, `${b.kind === 'monster' ? '몬스터들' : '적'}의 사기가 무너졌다! 남은 적이 달아난다.`, 'info', d.id);
    endBattle(s, ctx, true);
  }
  else if (b.kind === 'raid' && rule(s, 'defense') && d.hp < d.max * 0.25 && rand(s) < dt * 0.5) {
    // 총력 방어: 수호자는 위급하면 물러나 목숨을 지킨다 (레어는 함락)
    log(s, ctx, `${d.name}, 더 버티지 못하고 둥지 깊숙이 물러났다.`, 'info', d.id);
    endBattle(s, ctx, false, true);
  } else if ((d.hp < d.max * 0.18 || b.hp < b.max * 0.15) && rand(s) < dt * 0.12) endBattle(s, ctx, b.hp < b.max * 0.15, true);
}

/** 전투 승리 확률 추정 (지원 요청 화면용). [하한, 상한] % */
export function riskEstimate(d: Dragon, force: number): [number, number] {
  const n = ((force * 2) / Math.max(1, d.power * 1.6)) * force * 0.02 * (1 + d.injury * 0.05);
  const r = Math.round(100 / (1 + Math.exp(-4 * (n / Math.max(1, d.hp) - 1))));
  return [Math.max(1, r - 15), Math.min(99, r + 15)];
}

const compatible = (a: Dragon, b: Dragon) =>
  a.dead || b.dead || a.hp <= 0 || b.hp <= 0
    ? false
    : a.species === b.species || a.second === b.species || b.second === a.species ||
      (a.second !== undefined && a.second === b.second) || (isAdult(a) && isAdult(b));

// ---------------------------------------------------------------- 시간 진행

/** dt 초만큼 세계를 진행한다. dt는 1초 이하로 나눠서 넘길 것. */
export function step(s: State, dt: number, ctx: Ctx) {
  if (!s.started || s.over) return;
  s.time += dt;

  // 지원 요청 응답 시간 초과
  if (s.prompt && s.time >= s.prompt.expires) resolveSupport(s, false, ctx, true);

  for (const p of s.patrols) {
    p.progress += dt;
    if (p.progress >= p.duration) {
      p.progress = 0;
      p.target = Math.floor(rand(s) * REGIONS.length);
      p.force = Math.max(50, s.towns[p.town].army * 0.15);
    }
  }

  if (s.time > (s.nextTalk ?? T.TALK_FIRST)) {
    s.nextTalk = s.time + T.TALK;
    const home = s.dragons.filter((d) => !d.dead && d.home === 0 && !d.mission);
    if (home.length > 1 && compatible(home[0], home[1])) {
      log(s, ctx, `${home[0].name}: “하늘을 두려워하지 마.” ${home[1].name || '어린 용'}이 날개를 펼쳐 답했다.`, 'talk');
    }
  }

  if (s.battle) battleStep(s, ctx, dt);

  for (const d of s.dragons) {
    if (d.dead) continue;
    d.age += dt;
    if (isAdult(d) && !d.matured) {
      d.matured = true;
      if (d.species === 0 && d.generation > 1) d.revenge = true;
      log(s, ctx, `${d.name}, 성체로 성장했다.`, 'adult', d.id);
    }
    if (d.revenge && isAdult(d) && !d.mission && !s.battle && d.hp > d.max * 0.75) {
      d.revenge = false;
      d.mission = { kind: 'revenge', target: Math.floor(rand(s) * s.towns.length), left: T.TRAVEL, total: T.TRAVEL };
      log(s, ctx, `${d.name}, 인간 마을을 향해 날아올랐다.`, 'depart', d.id);
    }
    if (!d.mission && s.battle?.dragon !== d.id) {
      d.hp = Math.min(d.max, d.hp + dt * RATE.HP * (d.home === 0 && hasDecor(s, 'crystal') ? 1.15 : 1));
      d.energy = Math.min(100, d.energy + dt * RATE.ENERGY);
      d.injury = Math.max(0, d.injury - dt * RATE.INJURY);
      d.xp += dt * RATE.XP;
    }
    while (d.xp >= 100 * d.level) {
      d.xp -= 100 * d.level;
      d.level++;
      d.max += 20;
      d.hp += 20;
      d.power += 4;
      log(s, ctx, `${d.name} Lv.${d.level} 성장.`, 'level', d.id);
    }
    if (isAdult(d) && d.species !== 0 && d.home === 0 && !d.mission) {
      d.mission = { kind: 'migrate', target: d.species, left: T.TRAVEL, total: T.TRAVEL };
      log(s, ctx, `${d.name}, 성체가 되어 ${SPECIES[d.species]} 레어로 떠난다.`, 'migrate', d.id);
    }
    if (isAdult(d) && d.age > T.LAY + d.laid * T.LAY && d.laid < 3 && s.eggs.length < 3 && d.home === 0 && !d.mission) {
      s.eggs.push({ id: 'e' + s.seed + Math.floor(s.time), species: d.species, left: T.HATCH, parent: d.id, generation: d.generation + 1 });
      d.laid++;
      log(s, ctx, `${d.name}의 알이 둥지에 놓였다.`, 'egg', d.id);
    }
    if (d.mission && s.battle?.dragon !== d.id) {
      if (s.battle && ['hunt', 'support', 'revenge'].includes(d.mission.kind) && d.mission.left <= dt && !(d.mission.kind === 'hunt' && rule(s, 'parallel'))) continue;
      d.mission.left -= dt;
      if (d.mission.left <= 0) arrive(s, ctx, d);
    }
  }

  if (s.yields) for (let i = 0; i < s.yields.length; i++) s.yields[i] = Math.min(1, s.yields[i] + dt / 3600);
  for (const d of s.dragons) autoHunt(s, ctx, d);
  if (Math.floor(s.time / 10) !== Math.floor((s.time - dt) / 10)) checkAchievements(s, ctx);

  if (s.time >= (s.nextHuman ?? T.HUMAN_FIRST) && !s.battle) humanVisit(s, ctx);

  for (const egg of [...s.eggs]) {
    egg.left -= dt;
    if (egg.left <= 0) {
      const d = makeDragon(s, egg.species, egg.generation, egg.parent);
      d.second = egg.second;
      s.dragons.push(d);
      s.eggs = s.eggs.filter((x) => x.id !== egg.id);
      log(s, ctx, `${SPECIES[egg.species]}의 알이 부화했다.${egg.species === 0 ? ` 새 흑염룡에게 ‘${d.name}’이라는 이름이 붙었다.` : ''}`, 'hatch', d.id);
    }
  }

  if (s.time >= s.nextEvent && !s.prompt && !s.battle) worldEvent(s, ctx);

  for (const t of s.towns) {
    t.army += dt * (t.ruin > 0 ? RATE.ARMY_RUINED : RATE.ARMY);
    if (t.ruin > 0) t.ruin = Math.max(0, t.ruin - dt);
  }

  if (s.time > (s.towns.length - 2) * T.TOWN && s.towns.length < 8) {
    s.towns.push({ name: NEW_TOWNS[s.towns.length - 3], army: 250, ruin: 0 });
    log(s, ctx, '인간의 새 정착지가 세워졌다.', 'town');
  }

  if (!s.dragons.some((d) => !d.dead && d.species === 0) && !s.eggs.some((e) => e.species === 0)) {
    s.over = true;
    log(s, ctx, '마지막 흑염룡과 알이 사라졌다. 이 혈통의 연대기가 끝났다.', 'over');
  }
}

function arrive(s: State, ctx: Ctx, d: Dragon) {
  const m = d.mission!;
  d.mission = undefined;
  if (m.kind === 'migrate') {
    d.home = m.target;
    log(s, ctx, `${d.name}, 고향 레어에 정착했다.`, 'info', d.id);
  } else if (m.kind === 'revenge') {
    const town = s.towns[m.target];
    startBattle(s, ctx, d, Math.max(100, town.army * 0.5), town.name, 'revenge', m.target);
  } else if (m.kind === 'support') {
    if (rand(s) < 0.25) {
      for (const o of s.dragons.filter((x) => x.home === m.target && !x.dead)) {
        o.hp -= o.max * (0.5 + rand(s));
        if (ctx.offline) o.hp = Math.max(1, o.hp);
        if (o.hp <= 0) { o.dead = true; o.diedAt = s.time; }
      }
      log(s, ctx, '도착했지만 동맹 레어는 이미 함락되었다. 생존자의 흔적을 찾아 돌아온다.');
      d.mission = { kind: 'return', target: 0, left: T.TRAVEL, total: T.TRAVEL, from: { type: 'lair', index: m.target } };
    } else if (!s.battle) {
      startBattle(s, ctx, d, m.force || 600, SPECIES[m.target] + ' 레어', 'support', m.target);
    }
  } else if (m.kind === 'hunt' && (!s.battle || rule(s, 'parallel'))) {
    const r = REGIONS[m.target];
    const patrol = s.patrols.find((p) => p.target === m.target && p.progress > p.duration * 0.3 && p.progress < p.duration * 0.8);
    // 동시 사냥: 이미 다른 전투가 화면에 있으면 이 전투는 결과만 바로 계산한다
    const shown = s.battle;
    if (shown) s.battle = null;
    startBattle(
      s, ctx, d,
      patrol ? patrol.force : 90 * r.risk + rand(s) * 100,
      r.name + ' · ' + (patrol ? '인간 원정대' : r.monsters[Math.floor(rand(s) * r.monsters.length)]),
      patrol ? 'encounter' : 'monster',
      m.target,
    );
    if (shown) {
      for (let n = 0; s.battle && n < 2400; n++) battleStep(s, ctx, 0.5);
      if (s.battle) endBattle(s, ctx, false, true);
      s.battle = shown;
    }
  } else {
    log(s, ctx, `${d.name}, 레어 귀환.`, 'return', d.id);
  }
}

/** 결투 뒤: 진 도전자가 살아남아 숙적이 되거나, 숙적의 이야기가 이어진다 */
function duelAftermath(s: State, ctx: Ctx, b: Battle, won: boolean) {
  const isNem = b.place.includes('숙적 ');
  const name = b.place.split('· ').pop()!.replace('숙적 ', '');
  if (isNem && s.nemesis) {
    const n = s.nemesis;
    if (won) {
      n.defeats++;
      if (n.defeats >= 3) {
        s.resources += 150;
        log(s, ctx, `숙적 ${n.name}, 세 번째 패배 끝에 무릎 꿇었다. 전설의 검을 레어 앞에 두고 떠났다. 유물 +150`, 'train');
        s.nemesis = undefined;
      } else log(s, ctx, `숙적 ${n.name}, 또 패했다. “다음엔… 반드시!” (${n.defeats}/3패)`, 'human');
    } else {
      n.wins++;
      log(s, ctx, `숙적 ${n.name}이(가) 이겼다. 그의 이름이 인간 마을에 퍼진다.`, 'human');
    }
  } else if (won && !s.nemesis && rand(s) < 0.5) {
    s.nemesis = { name, level: 1, defeats: 1, wins: 0 };
    log(s, ctx, `패배한 ${name}이(가) 이를 갈며 사라졌다. 숙적이 생겼다.`, 'human');
  }
}

const HUMAN_NAMES = ['떠돌이 용사 카엘', '은빛 창의 레온', '이름 없는 기사', '용 사냥꾼 브란'];

/** 인간들과의 작은 만남 (테스트판). 바탕화면에서 인간이 찾아오는 연출과 이어진다. */
function humanVisit(s: State, ctx: Ctx) {
  s.nextHuman = s.time + T.HUMAN_MIN + rand(s) * T.HUMAN_RAND;
  const home = s.dragons.filter((d) => !d.dead && d.home === 0 && !d.mission);
  if (!home.length) return;
  const town = s.towns[Math.floor(rand(s) * s.towns.length)];
  const ruined = s.towns.some((t) => t.ruin > 0);
  const roll = rand(s);
  // 명성: 내 레어 드래곤들의 승리 합. 이름이 날수록 도전자와 음유시인이 많이 찾아온다
  const fame = s.dragons.filter((d) => !d.dead && d.home === 0).reduce((a, d) => a + (d.wins ?? 0), 0);
  const famous = [...home].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))[0];
  const pick = rand(s) < 0.6 && (famous.wins ?? 0) > 0 ? famous : home[Math.floor(rand(s) * home.length)];
  const tributeP = ruined ? 0.45 : 0.3;
  const bardP = tributeP + (fame >= 10 ? 0.3 : 0.25) + (hasDecor(s, 'banner') ? 0.08 : 0);
  const duelP = bardP + (fame >= 20 ? 0.3 : 0.25);
  if (roll < tributeP) {
    const gift = Math.round((15 + Math.floor(rand(s) * 25) + (ruined ? 15 : 0)) * (hasDecor(s, 'hoard') ? 1.2 : 1));
    s.resources += gift;
    stats(s).tributes++;
    log(s, ctx, `${town.name}의 사절단이 레어 입구에 공물을 두고 서둘러 물러갔다. 유물 +${gift}`, 'human', pick.id, 'tribute');
  } else if (roll < bardP) {
    pick.xp += 40;
    log(s, ctx, `${town.name}의 음유시인이 멀리서 ${pick.name}의 무용담을 노래했다. 경험치 +40`, 'human', pick.id, 'bard');
  } else if (roll < Math.min(0.95, duelP)) {
    // 소문난 드래곤에게 도전한다 (승리가 같으면 더 강한 쪽)
    const fighter = home.filter((d) => isAdult(d) && d.hp > d.max * 0.6).sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || b.power - a.power)[0];
    const hero = HUMAN_NAMES[Math.floor(rand(s) * HUMAN_NAMES.length)];
    if (!fighter || ctx.offline) {
      log(s, ctx, `${hero}이(가) 레어 앞까지 왔다가 용의 그림자를 보고 발길을 돌렸다.`, 'human', pick.id, 'challenger');
      return;
    }
    // 숙적이 있으면 절반은 그가 다시 온다 (올 때마다 강해진다)
    const nem = s.nemesis && rand(s) < 0.5 ? s.nemesis : null;
    const name = nem ? nem.name : hero;
    if (nem) {
      nem.level++;
      log(s, ctx, `숙적 ${nem.name}이(가) 더 단단해진 갑옷을 입고 돌아왔다! ${fighter.name}을(를) 지목한다. (${nem.level}번째 도전)`, 'human', fighter.id, 'challenger');
    } else {
      log(s, ctx, `${hero}이(가) ${fighter.wins ? `‘${titleOf(fighter) ?? '사냥꾼'}’ ` : ''}${fighter.name}에게 결투를 청했다!`, 'human', fighter.id, 'challenger');
    }
    const base = 60 + rand(s) * 100 + fighter.level * 6;
    startBattle(s, ctx, fighter, nem ? base * (1 + 0.4 * nem.level) : base, '황혼의 레어 앞 · ' + (nem ? '숙적 ' : '') + name, 'duel', 0);
  } else {
    for (const d of home) d.injury = Math.max(0, d.injury - 1.5);
    log(s, ctx, '길 잃은 순례자들이 둥지 근처에 약초 꾸러미를 두고 기도하고 떠났다. 부상 회복', 'human', pick.id, 'pilgrim');
  }
}

function worldEvent(s: State, ctx: Ctx) {
  s.nextEvent = s.time + T.EVENT_MIN + rand(s) * T.EVENT_RAND;
  const roll = rand(s);
  const g = guardian(s);
  const sp = 1 + Math.floor(rand(s) * (SPECIES.length - 1));
  if (roll < 0.38 && s.eggs.length < 3 && s.dragons.some((d) => d.species === sp && isAdult(d) && !d.dead)) {
    s.eggs.push({
      id: 'e' + s.seed,
      species: sp,
      left: T.HATCH,
      generation: 1,
      second: rand(s) < 0.12 ? 1 + Math.floor(rand(s) * (SPECIES.length - 1)) : undefined,
    });
    log(s, ctx, `${SPECIES[sp]} 성체가 알을 맡겼다. 종을 넘어선 신뢰의 증표다.`, 'visit');
    if (!ctx.offline) ctx.notices.push({ kind: 'info', text: '', ally: { species: sp, why: 'egg', rel: s.relations[sp] } });
  } else if (roll < 0.7 && g && !g.mission && s.dragons.some((d) => d.home === sp && isAdult(d) && !d.dead)) {
    if (ctx.offline) return; // 꺼져 있던 동안에는 지원 요청을 만들지 않는다
    s.prompt = {
      kind: 'support',
      target: sp,
      known: rand(s) > 0.35,
      force: Math.round(400 + rand(s) * 600),
      expires: s.time + T.SUPPORT_TIMEOUT,
    };
    log(s, ctx, `${SPECIES[sp]} 성체의 텔레파시: 레어가 습격당하고 있다. 지원 여부를 정해 주세요.`, 'support', g.id);
  } else if (roll < 0.74 && g?.mission) {
    const d = s.dragons.find((x) => !x.dead && x.home === 0 && !x.mission);
    if (d) startBattle(s, ctx, d, 200 + rand(s) * 300, '황혼의 레어', 'raid');
  } else if (g && !g.mission) {
    let force = 300 + Math.min(s.time / TIME_SCALE, 3000) * 0.2; // 웹 버전 시간 기준으로 성장
    if (s.relations.filter((r) => r < 0).length > 5) {
      force = s.towns.reduce((a, t) => a + t.army, 0) * 0.92;
      log(s, ctx, '적대적인 드래곤들이 인간 연합군과 동맹을 맺었다.');
    }
    startBattle(s, ctx, g, force, '황혼의 레어', 'raid');
  }
}

// ---------------------------------------------------------------- 따라잡기

export interface Summary {
  seconds: number;
  levels: number;
  hatches: number;
  deaths: string[];
  wins: number;
  losses: number;
  raids: number;
  falls: number;
  towns: number;
  ruins: number;
  over: boolean;
  /** 늘어난 고대 유물 (쓴 만큼 빼고) */
  resources?: number;
  /** 인간 방문 · 자동 사냥 출발 · 수련/칭호 소식 */
  humans?: number;
  autoHunts?: number;
  titles?: string[];
}

/** 꺼져 있던 seconds 초를 한꺼번에 계산한다. 전투는 화면 없이 결과만 낸다. */
export function catchUp(s: State, seconds: number, stepSize = 0.5): Summary {
  const ctx = newCtx(true);
  const before = s.events.length ? s.events[0] : null;
  const res0 = s.resources;
  let left = seconds;
  while (left > 0 && !s.over && s.started) {
    const dt = Math.min(stepSize, left);
    step(s, dt, ctx);
    left -= dt;
  }
  const fresh: WorldEvent[] = [];
  for (const e of s.events) {
    if (e === before) break;
    fresh.push(e);
  }
  const count = (k: EventKind) => fresh.filter((e) => e.kind === k).length;
  return {
    seconds,
    levels: count('level'),
    hatches: count('hatch'),
    deaths: fresh.filter((e) => e.kind === 'death').map((e) => e.text),
    wins: count('win'),
    losses: count('loss') + count('retreat'),
    raids: fresh.filter((e) => e.kind === 'raid').length,
    falls: count('fall'),
    towns: count('town'),
    ruins: count('ruin'),
    over: s.over,
    resources: s.resources - res0,
    humans: count('human'),
    autoHunts: fresh.filter((e) => e.kind === 'depart' && e.text.includes('자동 사냥')).length,
    titles: fresh.filter((e) => e.kind === 'train' && e.text.includes('칭호')).map((e) => e.text),
  };
}

// ---------------------------------------------------------------- 웹 버전 저장 파일 가져오기

/** 웹 버전(로컬 웹게임)에서 내보낸 JSON을 새 형식으로 바꾼다. 시간 값에는 배율을 곱한다. */
export function importWeb(raw: unknown, chronicle = 1): State {
  const obj = raw as Record<string, unknown>;
  const w = (obj && typeof obj === 'object' && 'state' in obj ? obj.state : obj) as Record<string, any>;
  if (!w || w.version !== 1 || !Array.isArray(w.dragons) || !w.dragons.length || !Array.isArray(w.towns) || !Array.isArray(w.eggs)) {
    throw new Error('지원하지 않는 저장 파일입니다.');
  }
  if ((w as any).format === 'blackflame-desktop') return w as unknown as State;
  const k = TIME_SCALE; // 웹 버전 → 새 버전 시간 배율
  const num = (v: unknown, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  const mission = (m: any): Mission | undefined =>
    m && ['hunt', 'support', 'migrate', 'return', 'revenge'].includes(m.kind)
      ? { kind: m.kind, target: num(m.target), left: num(m.left) * k, total: num(m.total, 180) * k, force: m.force }
      : undefined;
  const s: State = {
    format: 'blackflame-desktop',
    version: 1,
    started: true,
    time: num(w.time) * k,
    seed: num(w.seed, 1) >>> 0,
    dragons: w.dragons.map((d: any): Dragon => ({
      id: String(d.id),
      name: String(d.name || (d.species === 0 ? '이름 없는 흑염룡' : SPECIES[d.species] ?? '드래곤')),
      species: num(d.species),
      second: typeof d.second === 'number' ? d.second : undefined,
      grade: num(d.grade, 1),
      level: num(d.level, 1),
      xp: num(d.xp),
      age: num(d.age) * k,
      hp: num(d.hp),
      max: num(d.max, 300),
      power: num(d.power, 24),
      energy: num(d.energy, 100),
      injury: num(d.injury),
      home: num(d.home),
      generation: num(d.generation, 1),
      parent: d.parent,
      born: num(d.born) * k,
      laid: num(d.laid),
      matured: !!d.matured,
      revenge: !!d.revenge,
      dead: !!d.dead,
      diedAt: d.dead ? num(w.time) * k : undefined,
      mission: mission(d.mission),
    })),
    eggs: w.eggs.map((e: any): Egg => ({
      id: String(e.id), species: num(e.species), second: e.second, left: num(e.left) * k, parent: e.parent, generation: num(e.generation, 1),
    })),
    relations: Array.isArray(w.relations) && w.relations.length === 12 ? w.relations.map((r: unknown) => num(r, 35)) : SPECIES.map(() => 35),
    towns: w.towns.map((t: any) => ({ name: String(t.name), army: num(t.army, 500), ruin: num(t.ruin) * k })),
    patrols: (Array.isArray(w.patrols) ? w.patrols : []).map((p: any) => ({
      town: num(p.town), target: num(p.target), progress: num(p.progress) * k, duration: num(p.duration, 480) * k, force: num(p.force, 100),
    })),
    events: (Array.isArray(w.events) ? w.events : []).slice(0, 300).map((e: any) => ({ time: num(e.time) * k, text: String(e.text), kind: 'info' as EventKind })),
    prompt: null,
    battle: null, // 진행 중이던 전투는 가져오지 않는다
    resources: num(w.resources),
    nextEvent: num(w.nextEvent, 150) * k,
    nextTalk: typeof w.nextTalk === 'number' ? w.nextTalk * k : undefined,
    over: !!w.over,
    chronicle,
  };
  // 웹 버전에서 전투 중이던 드래곤은 귀환 상태로 둔다
  if (w.battle?.dragon) {
    const d = s.dragons.find((x) => x.id === w.battle.dragon);
    if (d && !d.dead && !d.mission) d.mission = { kind: 'return', target: 0, left: T.TRAVEL, total: T.TRAVEL };
  }
  // 이름 없는 첫 흑염룡이 있으면 자동 이름
  for (const d of s.dragons) if (!d.name.trim()) d.name = autoName(s, d.generation);
  log(s, null, '웹 버전의 연대기를 이어받았다.');
  return s;
}

/** 저장 파일의 최소 검증. 실패하면 Error */
export function validate(s: unknown): asserts s is State {
  const x = s as State;
  if (!x || x.format !== 'blackflame-desktop' || x.version !== 1) throw new Error('지원하지 않는 저장 파일입니다.');
  if (!Number.isFinite(x.time) || !Array.isArray(x.dragons) || !x.dragons.length || !Array.isArray(x.eggs) || !Array.isArray(x.towns) || !x.towns.length) {
    throw new Error('저장 파일이 손상되었습니다.');
  }
  if (!Array.isArray(x.relations) || x.relations.length !== 12) throw new Error('저장 파일이 손상되었습니다.');
  for (const d of x.dragons) {
    if (typeof d.id !== 'string' || !Number.isInteger(d.species) || d.species < 0 || d.species > 11) throw new Error('드래곤 정보가 손상되었습니다.');
  }
}
