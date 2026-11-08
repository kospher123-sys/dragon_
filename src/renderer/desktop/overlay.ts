// 바탕화면 오버레이: 드래곤, 둥지, 작업표시줄 위 몬스터, 조종 모드 이펙트를 캔버스 하나에 그린다.
import type { DesktopModel, DesktopDragon, DesktopApi, HumanEvent } from '../../shared/types';
import { sheets, speciesRow, hasSpeciesWalk, hasMonstersDesk } from '../sprites';
import { GRADES, GRADE_COLOR, SPECIES } from '../../engine/data';
import { personalityOf, type Personality } from '../../engine/engine';

// ---------------------------------------------------------------- 상수
const ATTACK_COOLDOWN = 1000; // ms, 연타해도 1초에 1회
const CONTROL_TIMEOUT = 60_000; // ms, 공격이 없으면 조종 모드 자동 해제
const STUN = 5; // 초
const FLY_TO_TARGET = 0.6; // 초
const EFFECT_TIME = 0.9; // 초
const NEST_W = 150;
const MONSTER_H = 46;

const LINES = ['…왜 불렀어?', '또 부르게?', '흥! 간지럽다니까.', '크르릉♪', '별이 뜨면 어디로 날아갈까?', '둥지 안쪽은 따뜻하지?', '저 산 너머까지 같이 가자.'];
const PERS_LINES: Record<Personality, string[]> = {
  용맹: ['적은 어디 있지?', '오늘도 하늘은 내 것이다!'],
  느긋: ['하암… 조금만 더 잘게.', '서두를 것 없잖아.'],
  호기심: ['저건 뭐지?', '인간들은 왜 저렇게 작을까?'],
  장난꾸러기: ['술래잡기 할래?', '히히, 못 잡지?'],
  도도: ['…용건만 말해.', '흥.'],
};
const SKILL_NAMES = ['흑염 브레스', '파멸의 발톱', '용의 포효', '낙성 강습'];
const MONSTER_NAMES = ['슬라임', '고블린', '오우거', '리치'];
const MONSTER_CUTS = [0, 0.21, 0.425, 0.68, 1];

type ImgName = 'sheet' | 'flight' | 'species' | 'monsters' | 'nest' | 'fx' | 'party-motion';
const imgs = {} as Record<ImgName, HTMLImageElement>;
for (const n of ['sheet', 'flight', 'species', 'monsters', 'nest', 'fx', 'party-motion'] as ImgName[]) {
  const i = new Image();
  i.src = `bf://img/${n}.png`;
  imgs[n] = i;
}
const ready = (i: HTMLImageElement) => i.complete && i.naturalWidth > 0;

// ---------------------------------------------------------------- 엔티티
type DMode = 'idle' | 'walk' | 'fly' | 'sleep' | 'attackFly' | 'cast' | 'leave';
interface DragonE {
  d: DesktopDragon;
  x: number; y: number; // 발 위치
  tx: number; ty: number;
  facing: 1 | -1;
  mode: DMode;
  timer: number;
  anim: number;
  hops: number;
  speech: string; speechT: number;
  alpha: number;
  gone?: boolean;
  /** 임무로 레어를 비워 화면 밖에 있음 */
  hidden?: boolean;
  /** 화면 밖으로 날아가는 중 */
  leaving?: boolean;
  speed: number;
  pers: Personality;
  /** 장난: 쫓는 상대 */
  chase?: DragonE;
  /** 다른 레어에서 잠깐 찾아온 손님 (모델에 없음) */
  guest?: number;
}

const present = (e: DragonE) => !e.gone && !e.hidden && !e.leaving;
const presentCount = () => [...dragons.values()].filter(present).length;

type MMode = 'walk' | 'idle' | 'hit' | 'stunned' | 'recover';
interface MonsterE { kind: number; x: number; dir: 1 | -1; speed: number; mode: MMode; timer: number; anim: number; panic?: number }

// 인간 (party-motion.png: 4열 × 6행 · 용사·창기사·궁수·마법사·사제·암살자, 오른쪽을 봄)
type HMode = 'walk' | 'talk' | 'fight' | 'leave' | 'flee';
interface HumanE {
  role: number;
  x: number; dir: 1 | -1;
  tx: number;
  speed: number;
  mode: HMode;
  timer: number;
  anim: number;
  speech: string; speechT: number;
  alpha: number;
  /** 도착하면 할 일 */
  plan: 'talk' | 'fight' | 'pass';
  lines: string[];
  dragon?: string;
  gone?: boolean;
}
interface Prop { kind: 'chest' | 'herb' | 'spark' | 'heart' | 'coin' | 'combo'; x: number; y: number; t: number; max: number; n?: number }
let lastHit: { m: MonsterE; t: number } | null = null;
let combo = 1;

type Target = MonsterE | HumanE;
const isHuman = (t: Target): t is HumanE => 'role' in t;

interface Effect { skill: number; from: DragonE; target: Target; t: number; hitDone: boolean }

// ---------------------------------------------------------------- 상태
let api: DesktopApi;
let model: DesktopModel = { dragons: [], eggs: [], perf: 'high', nest: null };
let W = window.innerWidth, H = window.innerHeight;
const canvas = document.createElement('canvas');
const g = canvas.getContext('2d')!;
const dragons = new Map<string, DragonE>();
const monsters: MonsterE[] = [];
const humans: HumanE[] = [];
const props: Prop[] = [];
let nextAmbient = performance.now() + 120_000;
let nextDropIn = performance.now() + 600_000;
/** 레어 함락 뒤 둥지에서 연기가 피어오르는 시각 */
let smokeUntil = 0;
const HUMAN_H = 84;
let effect: Effect | null = null;
let control = false;
let controlSince = 0;
let lastAttack = 0;
let visible = true;
let nest = { x: 0, y: 0 };
let mouse = { x: -1, y: -1 };
let dragging: { dx: number; dy: number } | null = null;
let hoverKind: string | null = null;
let skillText: { text: string; x: number; y: number; t: number } | null = null;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ground = () => H - 2;

// ---------------------------------------------------------------- 크기
function dragonSize(d: DesktopDragon) {
  const k = (d.adult ? 1 : 0.65) * [0.8, 0.94, 1, 1.07, 1.17][d.grade];
  return d.species === 0 ? { w: 132 * k, h: 143 * k } : { w: 170 * k, h: 113 * k };
}
const nestRect = () => ({ x: nest.x, y: nest.y - NEST_W * 0.62, w: NEST_W, h: NEST_W * 0.62 });
const buttons = () => {
  const r = nestRect();
  return [
    { id: 'control', x: r.x + 4, y: r.y - 30, w: 72, h: 24, label: control ? '조종 중' : '조종하기' },
    { id: 'manager', x: r.x + 80, y: r.y - 30, w: 66, h: 24, label: '관리 창' },
  ];
};

// ---------------------------------------------------------------- 모델 반영
// ---------------------------------------------------------------- 바탕화면 방어전
let defense = false;
let autoControl = false;
let nextWave = 0;

function updateDefense(raid: boolean) {
  if (raid && !defense) {
    defense = true;
    nextWave = performance.now() + 1500;
    if (visible && presentCount()) { autoControl = !control; setControl(true); }
  } else if (!raid && defense) {
    defense = false;
    if (autoControl) setControl(false);
    autoControl = false;
  }
}

/** 습격 동안 원정대가 파도처럼 몰려온다 */
function stepDefense(now: number) {
  if (!defense) return;
  controlSince = now; // 방어전 동안은 조종 시간이 줄지 않는다
  if (!control && presentCount()) { setControl(true); autoControl = true; }
  if (now < nextWave) return;
  nextWave = now + rnd(3500, 5500);
  const fighters = humans.filter((h) => !h.gone && h.plan === 'fight' && h.mode !== 'flee').length;
  if (fighters >= 6) return;
  const left = Math.random() < 0.5;
  const nx = nest.x + NEST_W / 2;
  const h = spawnHuman([0, 1, 2, 3, 5][Math.floor(Math.random() * 5)], 'fight', [], left, nx + (left ? -1 : 1) * rnd(NEST_W / 2 + 30, NEST_W / 2 + 160), { speed: rnd(70, 100) });
  if (Math.random() < 0.4) { h.speech = pickLine(['둥지를 노려라!', '알을 찾아라!', '돌격!', '용을 막아!']); h.speechT = 2.5; }
}

function applyModel(m: DesktopModel) {
  model = m;
  updateDefense(!!m.raid);
  if (m.nest && !dragging) nest = clampNest(m.nest.x, m.nest.y);
  const ids = new Set(m.dragons.map((d) => d.id));
  for (const d of m.dragons) {
    const e = dragons.get(d.id);
    if (e) {
      const wasAway = !!e.d.away;
      const prev = e.d;
      e.d = d;
      if (present(e)) {
        if (d.grade > prev.grade) {
          // 각성: 크게 반짝이며 포효
          props.push({ kind: 'spark', x: e.x, y: e.y - dragonSize(d).h * 0.5, t: 0, max: 3.5 });
          e.speech = `${GRADES[d.grade]}의 힘이 깨어났다!`; e.speechT = 4;
          e.mode = 'cast'; e.timer = EFFECT_TIME * 1.5;
        } else if ((d.level ?? 0) > (prev.level ?? 0)) {
          props.push({ kind: 'spark', x: e.x, y: e.y - dragonSize(d).h * 0.5, t: 0, max: 1.8 });
          if (e.speechT <= 0) { e.speech = `Lv.${d.level}! 강해졌다.`; e.speechT = 2.5; }
        } else if (d.adult && !prev.adult) {
          props.push({ kind: 'spark', x: e.x, y: e.y - dragonSize(d).h * 0.5, t: 0, max: 2.5 });
          e.speech = '이제 어른이다!'; e.speechT = 3;
        }
      }
      if (d.away && !wasAway && !e.hidden) depart(e);
      else if (!d.away && (e.hidden || e.leaving)) comeBack(e);
      continue;
    }
    const fromNest = d.home === 0;
    const sz = dragonSize(d);
    const ne: DragonE = {
      d,
      x: fromNest ? nest.x + NEST_W / 2 : Math.random() < 0.5 ? -sz.w : W + sz.w,
      y: fromNest ? ground() : rnd(H * 0.2, H * 0.5),
      tx: 0, ty: 0,
      facing: Math.random() < 0.5 ? 1 : -1,
      mode: fromNest ? 'idle' : 'fly',
      timer: rnd(1, 3),
      anim: Math.random() * 10,
      hops: 0,
      speech: '', speechT: 0,
      alpha: 0,
      speed: rnd(38, 62),
      pers: personalityOf(d.id),
    };
    if (ne.pers === '느긋') ne.speed *= 0.7;
    if (!fromNest) { ne.tx = rnd(W * 0.2, W * 0.8); ne.ty = ground(); }
    if (d.away) { ne.hidden = true; ne.mode = 'idle'; ne.timer = 1e9; }
    if (d.fresh && fromNest) {
      // 막 부화: 둥지에서 반짝이며 등장
      props.push({ kind: 'spark', x: nest.x + NEST_W / 2, y: nest.y - NEST_W * 0.3, t: 0, max: 2.5 });
      ne.speech = pickLine(['삐약…?', '크릉…?', '여긴 어디…?']);
      ne.speechT = 3;
    }
    dragons.set(d.id, ne);
  }
  for (const [id, e] of dragons) if (!ids.has(id) && e.guest === undefined) e.gone = true;
  if (control && !presentCount()) setControl(false);
}

/** 출격: 하늘로 올라 화면 가장자리 너머로 날아간다 */
function depart(e: DragonE) {
  const sz = dragonSize(e.d);
  e.chase = undefined;
  e.leaving = true;
  e.mode = 'fly';
  e.hops = 0;
  e.tx = e.x < W / 2 ? -sz.w * 1.5 : W + sz.w * 1.5;
  e.ty = H * rnd(0.15, 0.35);
  e.speech = pickLine(['다녀오겠다.', '사냥 간다!', '크아앙—!']);
  e.speechT = 2.5;
}

/** 귀환: 화면 가장자리에서 날아 들어와 둥지 근처에 내려앉는다 */
function comeBack(e: DragonE) {
  const sz = dragonSize(e.d);
  const fromLeft = Math.random() < 0.5;
  e.hidden = false;
  e.leaving = false;
  e.alpha = 1;
  e.x = fromLeft ? -sz.w : W + sz.w;
  e.y = H * rnd(0.15, 0.35);
  e.mode = 'fly';
  e.hops = 0;
  e.tx = nest.x + NEST_W / 2 + rnd(-120, 120);
  e.ty = ground();
  const l = e.d.last;
  e.speech = l
    ? (l.won ? pickLine([`${l.foe}, 해치웠다!`, `${l.foe} 따위.`, `다녀왔다! ${l.foe}는 별거 아니더군.`]) : pickLine([`${l.foe}… 다음엔 안 진다.`, '…좀 다쳤다.']))
    : e.d.hurt ? pickLine(['…좀 다쳤다.', '쉬어야겠어.']) : pickLine(['다녀왔다!', '배부르다.']);
  e.speechT = 3;
}

function clampNest(x: number, y: number) {
  return { x: Math.max(0, Math.min(W - NEST_W, x)), y: Math.max(NEST_W, Math.min(H, y)) };
}

// ---------------------------------------------------------------- 동작
/** 밤(오후 11시~오전 6시, 내 컴퓨터 시각)에는 둥지로 돌아가 자는 일이 잦다 */
const isNight = () => { const h = new Date().getHours(); return h >= 23 || h < 6; };

function pickNext(e: DragonE) {
  const r = Math.random();
  if (e.d.hurt && Math.random() < 0.5) { e.mode = 'idle'; e.timer = rnd(6, 12); return; }
  const p = e.pers;
  if (p === '느긋' && Math.random() < 0.35) { goSleep(e); return; }
  if (p === '용맹' && Math.random() < 0.3) { flyAround(e); return; }
  if (p === '도도' && Math.random() < 0.4) { e.mode = 'walk'; e.tx = nest.x + NEST_W / 2 + rnd(-140, 140); e.ty = ground(); return; }
  if (p === '호기심' && Math.random() < 0.45) {
    // 인간이나 몬스터 쪽으로 다가가 본다
    const t = humans.find((h) => !h.gone && h.mode !== 'flee') ?? monsters[Math.floor(Math.random() * monsters.length)];
    if (t) { e.mode = 'walk'; e.tx = Math.max(dragonSize(e.d).w / 2, Math.min(W - dragonSize(e.d).w / 2, t.x + (t.x > e.x ? -90 : 90))); e.ty = ground(); e.timer = 0; return; }
  }
  if (p === '장난꾸러기' && Math.random() < 0.25) {
    const others = [...dragons.values()].filter((o) => o !== e && present(o) && o.mode !== 'fly' && o.mode !== 'attackFly');
    if (others.length) {
      e.chase = others[Math.floor(Math.random() * others.length)];
      e.mode = 'walk';
      e.timer = 0;
      if (chatty()) { e.speech = pickLine(['거기 서!', '잡으러 간다~', '술래는 너야!']); e.speechT = 2.2; }
      return;
    }
  }
  if (isNight() && Math.random() < 0.6) {
    e.mode = 'walk';
    e.tx = nest.x + NEST_W / 2 + rnd(-30, 30);
    e.ty = ground();
    e.timer = -1;
    return;
  }
  const sz = dragonSize(e.d);
  if (r < 0.55) {
    e.mode = 'walk';
    e.tx = rnd(sz.w, W - sz.w);
    e.ty = ground();
  } else if (r < 0.75) {
    e.mode = 'fly';
    e.tx = rnd(sz.w, W - sz.w);
    e.ty = rnd(H * 0.15, H * 0.6);
    e.hops = Math.floor(rnd(1, 3));
  } else if (r < 0.9) {
    e.mode = 'walk';
    e.tx = nest.x + NEST_W / 2 + rnd(-30, 30);
    e.ty = ground();
    e.timer = -1; // 도착하면 잠든다
  } else {
    e.mode = 'idle';
    e.timer = rnd(3, 7);
  }
}

function goSleep(e: DragonE) {
  e.mode = 'walk';
  e.tx = nest.x + NEST_W / 2 + rnd(-30, 30);
  e.ty = ground();
  e.timer = -1;
}

function flyAround(e: DragonE) {
  const sz = dragonSize(e.d);
  e.mode = 'fly';
  e.tx = rnd(sz.w, W - sz.w);
  e.ty = rnd(H * 0.15, H * 0.6);
  e.hops = Math.floor(rnd(2, 4));
}

function stepDragon(e: DragonE, dt: number) {
  e.anim += dt;
  e.alpha = e.gone || e.hidden ? Math.max(0, e.alpha - dt * 1.6) : Math.min(1, e.alpha + dt * 2);
  if (e.guest !== undefined) {
    if (e.hidden) { e.gone = true; return; } // 손님은 화면 밖으로 나가면 끝
    e.guest -= dt;
    if (e.guest <= 0 && !e.leaving) { depart(e); e.speech = '그럼 이만.'; }
  }
  if (e.hidden) return;
  if (e.speechT > 0) e.speechT -= dt;
  const sz = dragonSize(e.d);
  switch (e.mode) {
    case 'idle':
    case 'sleep':
      e.timer -= dt;
      if (e.timer <= 0) pickNext(e);
      break;
    case 'walk': {
      if (e.chase) {
        const o = e.chase;
        if (!present(o) || o.mode === 'fly' || o.mode === 'attackFly') { e.chase = undefined; e.mode = 'idle'; e.timer = rnd(1, 3); break; }
        e.tx = o.x;
        if (Math.abs(o.x - e.x) < dragonSize(e.d).w * 0.45) {
          // 잡았다: 상대는 깜짝 놀라 도망가고, 쫓던 쪽은 신나 한다
          e.chase = undefined;
          e.mode = 'idle'; e.timer = rnd(2, 4);
          if (chatty()) { e.speech = pickLine(['잡았다!', '히히, 너 술래!', '크릉크릉♪']); e.speechT = 2.2; }
          o.mode = 'walk'; o.timer = 0; o.tx = Math.max(60, Math.min(W - 60, o.x + (o.x > e.x ? 1 : -1) * rnd(160, 320))); o.ty = ground();
          if (chatty()) { o.speech = pickLine(['으앗!', '반칙이야!', '두고 보자!']); o.speechT = 2; }
          break;
        }
      }
      const dx = e.tx - e.x;
      e.facing = dx >= 0 ? 1 : -1;
      const step = e.speed * (e.d.hurt ? 0.45 : 1) * (e.chase ? 2.2 : 1) * dt;
      if (Math.abs(dx) <= step) {
        e.x = e.tx;
        if (e.timer === -1) { e.mode = 'sleep'; e.timer = isNight() ? rnd(60, 180) : rnd(10, 25); }
        else { e.mode = 'idle'; e.timer = rnd(2, 6); }
      } else e.x += Math.sign(dx) * step;
      e.y = ground();
      break;
    }
    case 'fly':
    case 'attackFly': {
      const dx = e.tx - e.x, dy = e.ty - e.y;
      const dist = Math.hypot(dx, dy);
      const speed = e.mode === 'attackFly' ? Math.max(260, e.speed) : 150;
      if (Math.abs(dx) > 2) e.facing = dx >= 0 ? 1 : -1;
      if (dist <= speed * dt) {
        e.x = e.tx; e.y = e.ty;
        if (e.mode === 'attackFly') { e.mode = 'cast'; e.timer = EFFECT_TIME; break; }
        if (e.leaving) { e.leaving = false; e.hidden = true; e.alpha = 0; e.mode = 'idle'; e.timer = 1e9; break; }
        if (e.hops > 0) { e.hops--; e.tx = rnd(sz.w, W - sz.w); e.ty = rnd(H * 0.15, H * 0.6); }
        else if (e.ty < ground() - 1) { e.tx = rnd(sz.w, W - sz.w); e.ty = ground(); }
        else { e.mode = 'idle'; e.timer = rnd(2, 5); }
      } else {
        e.x += (dx / dist) * speed * dt;
        e.y += (dy / dist) * speed * dt;
      }
      break;
    }
    case 'cast':
      e.timer -= dt;
      if (e.timer <= 0) { e.mode = 'fly'; e.hops = 0; e.tx = e.x + e.facing * 60; e.ty = ground(); }
      break;
  }
}

function stepMonster(m: MonsterE, dt: number) {
  m.anim += dt;
  m.timer -= dt;
  const w = MONSTER_H * 1.1;
  switch (m.mode) {
    case 'walk':
      if (m.panic && m.panic > 0) m.panic -= dt;
      m.x += m.dir * m.speed * (m.panic && m.panic > 0 ? 2.4 : 1) * dt;
      if (m.x < w / 2) { m.x = w / 2; m.dir = 1; }
      if (m.x > W - w / 2) { m.x = W - w / 2; m.dir = -1; }
      if (m.timer <= 0) {
        if (Math.random() < 0.4) { m.mode = 'idle'; m.timer = rnd(1, 3); }
        else { if (Math.random() < 0.5) m.dir = (m.dir * -1) as 1 | -1; m.timer = rnd(2, 6); }
      }
      break;
    case 'idle':
      if (m.timer <= 0) { m.mode = 'walk'; m.timer = rnd(2, 6); }
      break;
    case 'hit':
      m.x -= m.dir * 30 * dt;
      if (m.timer <= 0) { m.mode = 'stunned'; m.timer = STUN; }
      break;
    case 'stunned':
      if (m.timer <= 0) { m.mode = 'recover'; m.timer = 0.5; }
      break;
    case 'recover':
      if (m.timer <= 0) {
        // 깨어나면 가장 가까운 드래곤 반대쪽으로 허둥지둥 달아난다
        m.mode = 'walk';
        m.timer = rnd(2.5, 4);
        let near: DragonE | null = null;
        for (const e of dragons.values()) if (present(e) && (!near || Math.abs(e.x - m.x) < Math.abs(near.x - m.x))) near = e;
        if (near) m.dir = near.x > m.x ? -1 : 1;
        m.panic = 3;
      }
      break;
  }
}

function hitMonster(m: MonsterE) {
  if (m.mode === 'stunned') { m.timer = STUN; return; } // 기절 중이면 처음부터 다시
  m.mode = 'hit';
  m.timer = 0.3;
}

// ---------------------------------------------------------------- 조종 모드
function setControl(on: boolean) {
  control = on && presentCount() > 0;
  controlSince = performance.now();
}

function attack(m: Target) {
  const now = performance.now();
  if (now - lastAttack < ATTACK_COOLDOWN || effect) return; // 1초 제한 + 이펙트 1개
  const list = [...dragons.values()].filter(present);
  if (!list.length) return;
  lastAttack = now;
  controlSince = now;
  // 용맹한 드래곤이 먼저 나서는 일이 많다
  const brave = list.filter((x) => x.pers === '용맹');
  const e = brave.length && Math.random() < 0.5 ? brave[Math.floor(Math.random() * brave.length)] : list[Math.floor(Math.random() * list.length)];
  e.chase = undefined;
  const skill = Math.floor(Math.random() * 4);
  const side = m.x > W / 2 ? -1 : 1;
  e.mode = 'attackFly';
  e.tx = Math.max(60, Math.min(W - 60, m.x + side * 110));
  e.ty = ground() - MONSTER_H - 70;
  const dist = Math.hypot(e.tx - e.x, e.ty - e.y);
  e.speed = Math.max(260, dist / FLY_TO_TARGET);
  e.facing = m.x >= e.tx ? 1 : -1;
  effect = { skill, from: e, target: m, t: -1, hitDone: false };
  const name = skill === 0 && e.d.species !== 0 ? '숨결' : SKILL_NAMES[skill];
  skillText = { text: `${e.d.name.split(' · ')[0]} · ${name}`, x: e.tx, y: e.ty - 90, t: 1.6 };
}

function stepEffect(dt: number) {
  if (!effect) return;
  const e = effect.from;
  if (effect.t < 0) {
    // 드래곤이 도착하면 시작 (최대 FLY_TO_TARGET 초 + 여유)
    if (e.mode === 'cast' || e.gone) effect.t = 0;
    return;
  }
  effect.t += dt;
  if (!effect.hitDone && effect.t >= EFFECT_TIME * 0.45) {
    effect.hitDone = true;
    if (isHuman(effect.target)) {
      const h = effect.target;
      const wasFighter = h.plan === 'fight' && h.mode !== 'flee';
      scare(h, true);
      // 방어전: 침입자를 쫓아내면 실제 습격 전투의 적 전력이 깎인다
      if (defense && wasFighter) void api.defend().then((err) => { if (!err) props.push({ kind: 'combo', x: h.x, y: ground() - HUMAN_H - 20, t: 0, max: 1.4, n: -1 }); });
    }
    else {
      const m = effect.target;
      hitMonster(m);
      // 연쇄: 3초 안에 다른 몬스터를 연달아 맞히면
      const t = performance.now();
      if (lastHit && lastHit.m !== m && t - lastHit.t < 3000) {
        combo++;
        props.push({ kind: 'combo', x: m.x, y: ground() - MONSTER_H - 34, t: 0, max: 1.4, n: combo });
      } else combo = 1;
      lastHit = { m, t };
      // 바탕화면 몬스터 퇴치 보상 (게임 하루 20번까지)
      void api.bounty().then((err) => { if (!err) props.push({ kind: 'coin', x: m.x, y: ground() - MONSTER_H - 10, t: 0, max: 1.5 }); });
    }
  }
  if (effect.t >= EFFECT_TIME) effect = null;
}

// ---------------------------------------------------------------- 인간 연출
const PASSER_LINES = ['저, 저기 용이다!', '히익!', '모, 못 본 걸로 할게요…', '엄마아아!', '용이다! 도망쳐!'];
const DRAGON_REPLIES: Record<string, string[]> = {
  tribute: ['크르릉… 반짝이는 거다.', '흥, 이 정도면 봐주지.', '공물이라니, 기특하군.'],
  bard: ['…나쁘지 않은 노래군.', '내 이야기를 더 크게 불러라.', '크릉♪'],
  challenger: ['감히 내 둥지 앞에서?', '덤벼라, 인간.', '후회하게 될 거다.'],
  pilgrim: ['…약초 냄새가 좋군.', '조용히 지나가라.', '기도는 받아 두지.'],
  raid: ['둥지를 지켜라!', '한 놈도 못 지나간다!', '크아아아!'],
};
const pickLine = (a: string[]) => a[Math.floor(Math.random() * a.length)];
/** 잡담 대사를 할지: 설정의 말풍선 양에 따라 */
const chatty = () => Math.random() < (model.chatter === 'many' ? 1 : model.chatter === 'few' ? 0 : 0.6);

function spawnHuman(role: number, plan: HumanE['plan'], lines: string[], fromLeft: boolean, tx: number, extra?: Partial<HumanE>): HumanE {
  const h: HumanE = {
    role, plan, lines,
    x: fromLeft ? -40 : W + 40,
    dir: fromLeft ? 1 : -1,
    tx: Math.max(30, Math.min(W - 30, tx)),
    speed: rnd(55, 75),
    mode: 'walk', timer: 0, anim: Math.random() * 3,
    speech: '', speechT: 0, alpha: 1,
    ...extra,
  };
  humans.push(h);
  return h;
}

function dragonById(id?: string) {
  const e = id ? dragons.get(id) : undefined;
  return e && present(e) ? e : [...dragons.values()].filter(present)[0];
}

/** 드래곤이 인간 쪽으로 다가가 한마디 한다 */
function dragonMeets(id: string | undefined, x: number, type: string, fight = false) {
  const e = dragonById(id);
  if (!e || !present(e)) return;
  const side = x > W / 2 ? -1 : 1;
  const sz = dragonSize(e.d);
  e.tx = Math.max(sz.w / 2, Math.min(W - sz.w / 2, x + side * (sz.w * 0.6 + 40)));
  if (fight) { e.mode = 'fly'; e.hops = 0; e.ty = ground(); e.speed = 200; }
  else { e.mode = 'walk'; e.ty = ground(); e.timer = 0; }
  setTimeout(() => {
    if (e.gone) return;
    e.facing = x >= e.x ? 1 : -1;
    e.speech = pickLine(DRAGON_REPLIES[type] ?? DRAGON_REPLIES.pilgrim);
    e.speechT = 3.5;
    if (fight) { e.mode = 'cast'; e.timer = EFFECT_TIME; }
  }, fight ? 1800 : 2600);
}

/** 다른 레어 드래곤이 잠깐 날아와 인사하고 돌아간다 */
const GUEST_LINES = {
  egg: { warm: '이 알을 부탁한다. 너희 둥지라면 안심이야.', cold: '…다른 데 맡길 곳이 없어서 왔다. 잘 부탁하지.' },
  thanks: { warm: '도와줘서 고맙다. 이 은혜는 잊지 않겠다.', cold: '…이번엔 도움을 받았군. 빚은 갚겠다.' },
  'drop-in': { warm: '지나가는 길에 들렀다. 둥지가 근사하군!', cold: '…' },
};

function allyVisit(species: number, why: 'thanks' | 'egg' | 'drop-in', rel = 35) {
  const id = 'guest-' + Math.random().toString(36).slice(2, 7);
  const d: DesktopDragon = { id, name: SPECIES[species] + ' 손님', species, grade: 2, adult: true, home: species };
  const sz = dragonSize(d);
  const fromLeft = Math.random() < 0.5;
  const e: DragonE = {
    d, x: fromLeft ? -sz.w : W + sz.w, y: H * 0.25, tx: nest.x + NEST_W / 2 + (fromLeft ? -1 : 1) * (NEST_W / 2 + 60), ty: ground(),
    facing: fromLeft ? 1 : -1, mode: 'fly', timer: 0, anim: 0, hops: 0, speech: '', speechT: 0, alpha: 1, speed: 50,
    pers: '도도', guest: 30,
  };
  dragons.set(id, e);
  setTimeout(() => {
    if (e.gone) return;
    // 친밀도가 낮으면 냉담하게 말한다
    e.speech = GUEST_LINES[why][rel < 20 ? 'cold' : 'warm'];
    e.speechT = 5;
    if (why === 'egg') props.push({ kind: 'spark', x: nest.x + NEST_W / 2, y: nest.y - NEST_W * 0.3, t: 0, max: 2 });
    const host = [...dragons.values()].filter((x) => present(x) && !x.guest)[0];
    if (host) setTimeout(() => { host.speech = why === 'egg' ? '맡겨 둬.' : why === 'drop-in' ? '반갑다, 친구.' : '언제든 불러라.'; host.speechT = 3; }, 2200);
  }, (Math.hypot(e.tx - e.x, e.ty - e.y) / 150) * 1000 + 400); // 도착한 뒤에 말한다
}

function onHumanEvent(ev: HumanEvent) {
  if (!visible) return;
  if (ev.type === 'ally') { if (ev.species !== undefined) allyVisit(ev.species, ev.why ?? 'thanks', ev.rel); return; }
  if (ev.type === 'raid-won' || ev.type === 'fall') {
    // 습격 결과: 남아 있던 원정대는 달아나고, 드래곤들이 반응한다
    for (const h of humans) if (h.plan === 'fight' && !h.gone) scare(h, true);
    const won = ev.type === 'raid-won';
    const list = [...dragons.values()].filter((e) => present(e) && e.guest === undefined && e.d.home === 0);
    list.slice(0, 3).forEach((e, i) => setTimeout(() => {
      if (!present(e)) return;
      e.speech = (won ? ['둥지는 무사하다!', '크아아앙—! 이겼다!', '다시는 오지 마라!'] : ['…둥지가 엉망이 됐어.', '알들은 무사한가?', '다음엔 반드시 지킨다.'])[i];
      e.speechT = 3.5;
      if (won && e.mode !== 'fly') { e.mode = 'cast'; e.timer = EFFECT_TIME; }
    }, i * 900));
    if (!won) smokeUntil = performance.now() + 90_000;
    return;
  }
  if (ev.type === 'refugee') {
    // 초토화된 마을의 피난민이 짐을 지고 화면을 가로질러 간다
    const left = Math.random() < 0.5;
    [4, 3, 1].forEach((role, i) => {
      const h = spawnHuman(role, 'pass', [], left, left ? W + 60 : -60, { speed: 34, x: (left ? -40 : W + 40) + (left ? -1 : 1) * i * 46 });
      if (i === 0) { h.speech = pickLine(['마을이… 다 타 버렸어.', '용의 분노를 샀어…', '새 터전을 찾아야 해.']); h.speechT = 4; }
      h.lines = ['refugee'];
    });
    return;
  }
  if (humans.filter((h) => !h.gone).length > 10) return; // 너무 붐비지 않게
  const fromLeft = nest.x + NEST_W / 2 > W / 2;
  const nx = nest.x + NEST_W / 2;
  const stop = nx + (fromLeft ? -1 : 1) * (NEST_W / 2 + 70);
  if (ev.type === 'tribute') {
    spawnHuman(0, 'talk', ['레어의 주인께 공물을 바칩니다!', '부, 부디 마을은 노여워 마시길…'], fromLeft, stop);
    spawnHuman(1, 'talk', [], fromLeft, stop + (fromLeft ? -46 : 46), { x: fromLeft ? -90 : W + 90 });
    dragonMeets(ev.dragon, stop, 'tribute');
  } else if (ev.type === 'bard') {
    const tx = nx + (fromLeft ? -1 : 1) * (NEST_W / 2 + 260);
    spawnHuman(3, 'talk', ['♪ 황혼의 용이여, 그 날개는 밤을 가르고 ♪', '♪ 비늘은 별빛처럼 빛나네 ♪'], fromLeft, tx);
    dragonMeets(ev.dragon, tx, 'bard');
  } else if (ev.type === 'pilgrim') {
    spawnHuman(4, 'talk', ['용이여, 평안이 함께하기를…', '약초를 두고 갑니다.'], fromLeft, stop);
    dragonMeets(ev.dragon, stop, 'pilgrim');
  } else if (ev.type === 'challenger') {
    const nem = ev.text?.includes('숙적');
    spawnHuman(nem ? 0 : Math.random() < 0.7 ? 0 : 5, 'fight', nem ? ['또 왔다, 용이여! 이번엔 다르다!', '내 검은 지난 패배를 기억한다!'] : ['용이여, 나와라! 결투다!', '이 검을 받아라!'], fromLeft, stop, { speed: 85 });
    dragonMeets(ev.dragon, stop, 'challenger', true);
  } else if (ev.type === 'raid') {
    [0, 1, 2, 3, 5].forEach((role, i) => {
      spawnHuman(role, 'fight', i === 0 ? ['용을 쓰러뜨려라!', '돌격!'] : i === 2 ? ['화살을 쏴라!'] : [], fromLeft, stop + (fromLeft ? -1 : 1) * i * 38, { x: (fromLeft ? -40 : W + 40) + (fromLeft ? -1 : 1) * i * 50, speed: 90 });
    });
    for (const e of [...dragons.values()].filter((x) => present(x) && x.d.home === 0).slice(0, 2)) dragonMeets(e.d.id, stop, 'raid', true);
  }
}

/** 인간을 놀라게 해 달아나게 한다 */
function scare(h: HumanE, hit = false) {
  if (h.mode === 'flee') return;
  h.mode = 'flee';
  h.dir = h.x < W / 2 ? -1 : 1;
  h.speed = 190;
  h.speech = pickLine(hit ? ['으아악!', '살려 줘!', '후퇴! 후퇴!'] : PASSER_LINES);
  h.speechT = 2.2;
}

function stepHuman(h: HumanE, dt: number) {
  h.anim += dt;
  if (h.speechT > 0) h.speechT -= dt;
  h.timer -= dt;
  switch (h.mode) {
    case 'walk': {
      const dx = h.tx - h.x;
      if (Math.abs(dx) <= h.speed * dt) {
        h.x = h.tx;
        if (h.plan === 'pass') { h.mode = 'leave'; break; }
        h.mode = h.plan === 'fight' ? 'fight' : 'talk';
        h.timer = h.plan === 'fight' ? rnd(10, 16) : rnd(6, 9);
        h.dir = nest.x + NEST_W / 2 >= h.x ? 1 : -1;
        if (h.lines[0]) { h.speech = h.lines[0]; h.speechT = 3.2; }
      } else {
        h.dir = dx > 0 ? 1 : -1;
        h.x += h.dir * h.speed * dt;
        // 지나가던 사람은 드래곤 가까이 오면 놀라 달아난다
        if (h.plan === 'pass') {
          for (const e of dragons.values()) {
            if (present(e) && Math.abs(e.x - h.x) < 150 && e.y > ground() - 200) { scare(h); break; }
          }
        }
      }
      break;
    }
    case 'talk':
      if (h.lines[1] && h.timer < 3.5 && h.speech !== h.lines[1]) { h.speech = h.lines[1]; h.speechT = 3; }
      if (h.timer <= 0) {
        if (h.role === 0 && h.lines.length && h.lines[0].includes('공물')) props.push({ kind: 'chest', x: h.x + h.dir * 40, y: ground(), t: 0, max: 40 });
        if (h.role === 4) props.push({ kind: 'herb', x: h.x + h.dir * 30, y: ground(), t: 0, max: 30 });
        h.mode = 'leave';
        h.dir = h.x < W / 2 ? -1 : 1;
      }
      break;
    case 'fight':
      if (h.lines[1] && h.timer < 5 && h.speech !== h.lines[1]) { h.speech = h.lines[1]; h.speechT = 2.5; }
      if (h.timer <= 0) scare(h, true);
      break;
    case 'leave':
    case 'flee':
      h.x += h.dir * h.speed * dt;
      if (h.x < -80 || h.x > W + 80) h.gone = true;
      break;
  }
}

// 드래곤끼리 수다: 가까이 쉬고 있는 두 마리가 성격에 맞는 말을 주고받는다
const TALKS: [Personality | '*', string, string][] = [
  ['용맹', '오늘 사냥은 내가 앞장선다.', '또 혼자 다 해치우려고?'],
  ['느긋', '하암… 해가 따뜻하다.', '너는 맨날 자는구나.'],
  ['호기심', '저 작은 인간들은 뭘 먹고 살까?', '…빵이라던데.'],
  ['장난꾸러기', '심심한데 술래잡기 할래?', '이번엔 안 속아.'],
  ['도도', '시끄럽다. 조용히 해.', '…알겠다고.'],
  ['*', '어젯밤 별똥별 봤어?', '응, 소원도 빌었지.'],
  ['*', '둥지가 좀 좁아진 것 같지 않아?', '네가 커서 그래.'],
  ['*', '인간 마을 쪽에서 연기가 나더라.', '…신경 꺼.'],
];
let nextTalk = performance.now() + 60_000;

function stepTalks(now: number) {
  if (now < nextTalk) return;
  nextTalk = now + rnd(70, 160) * 1000;
  if (!chatty()) return;
  const idle = [...dragons.values()].filter((e) => present(e) && e.guest === undefined && (e.mode === 'idle' || e.mode === 'sleep') && e.speechT <= 0);
  for (const a of idle) {
    const b = idle.find((o) => o !== a && Math.abs(o.x - a.x) < 260);
    if (!b) continue;
    const lines = TALKS.filter(([p]) => p === a.pers || p === '*');
    let [, l1, l2] = pickLine(lines.map((x) => x.join('|'))).split('|') as [string, string, string];
    const sp = specialDay();
    if (sp && Math.random() < 0.6) { [l1, l2] = SPECIAL_LINES[sp]; }
    a.facing = b.x >= a.x ? 1 : -1;
    b.facing = a.x >= b.x ? 1 : -1;
    a.speech = l1; a.speechT = 3;
    if (a.mode === 'sleep') a.mode = 'idle';
    a.timer = Math.max(a.timer, 5);
    setTimeout(() => { if (present(b)) { b.speech = l2; b.speechT = 3; b.timer = Math.max(b.timer, 4); } }, 2600);
    return;
  }
}

function stepHumans(dt: number, now: number) {
  stepTalks(now);
  for (const h of humans) stepHuman(h, dt);
  for (let i = humans.length - 1; i >= 0; i--) if (humans[i].gone) humans.splice(i, 1);
  for (const p of props) p.t += dt;
  for (let i = props.length - 1; i >= 0; i--) if (props[i].t >= props[i].max) props.splice(i, 1);
  // 친밀도 60 이상인 종족의 드래곤이 가끔 놀러 온다 (연출)
  if (now > nextDropIn) {
    nextDropIn = now + rnd(900, 1800) * 1000;
    const friends = (model.relations ?? []).map((r, i) => ({ r, i })).filter((x) => x.i > 0 && x.r >= 60);
    if (friends.length && presentCount() && visible) {
      const f = friends[Math.floor(Math.random() * friends.length)];
      allyVisit(f.i, 'drop-in', f.r);
    }
  }
  // 가끔 지나가는 여행자 (게임 진행과는 무관한 연출)
  if (now > nextAmbient) {
    nextAmbient = now + rnd(240, 480) * 1000;
    // 밤에는 길손이 드물다 (횃불 장식이 있으면 밤 순례자가 불빛을 보고 찾아온다)
    const night = isNight();
    if (night && !(model.decor ?? []).includes('torch')) { /* 조용한 밤 */ }
    else if (night && Math.random() < 0.4) {
      const left = Math.random() < 0.5;
      const nx = nest.x + NEST_W / 2;
      spawnHuman(4, 'talk', ['불빛을 보고 왔습니다… 잠시 쉬어 가도 될까요?', '용이여, 고요한 밤이 되기를.'], left, nx + (left ? -1 : 1) * (NEST_W / 2 + 90), { speed: 40 });
    } else if (!night && presentCount() && humans.length < 4) {
      const left = Math.random() < 0.5;
      spawnHuman([1, 2, 3, 4, 5][Math.floor(Math.random() * 5)], 'pass', [], left, left ? W + 60 : -60, { speed: rnd(40, 60) });
    }
  }
}

function humanRect(h: HumanE, wide = false) {
  // 방어전에서는 맞히기 쉽게 판정을 넓힌다
  const w = HUMAN_H * (wide ? 1.1 : 0.7), hh = HUMAN_H * (wide ? 1.15 : 1);
  return { x: h.x - w / 2, y: ground() - hh, w, h: hh };
}

function drawHuman(h: HumanE) {
  const img = imgs['party-motion'];
  if (!ready(img)) return;
  const sw = img.width / 4, sh = img.height / 6;
  const size = HUMAN_H * 1.18;
  const moving = h.mode === 'walk' || h.mode === 'leave' || h.mode === 'flee';
  const col = h.mode === 'fight' ? Math.floor(h.anim * 6) % 4 : 0;
  const bob = moving ? Math.abs(Math.sin(h.anim * (h.mode === 'flee' ? 16 : 9))) * 3 : 0;
  const tilt = moving ? Math.sin(h.anim * (h.mode === 'flee' ? 16 : 9)) * 0.05 : 0;
  g.save();
  g.translate(h.x, ground() - bob);
  g.rotate(tilt);
  if (h.dir < 0) g.scale(-1, 1);
  g.drawImage(img, col * sw, h.role * sh, sw, sh, -size / 2, -size, size, size);
  g.restore();
  if (h.speechT > 0) bubble(h.speech, h.x, ground() - HUMAN_H - 8);
  if (control && hovered === h) {
    const r = humanRect(h);
    g.save();
    g.strokeStyle = '#ff9a9a';
    g.setLineDash([4, 3]);
    g.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 4);
    g.restore();
  }
}

function drawProps() {
  for (const p of props) {
    const a = Math.min(1, (p.max - p.t) / 3) * Math.min(1, p.t * 3);
    g.save();
    g.globalAlpha = Math.max(0, a);
    g.translate(p.x, p.y);
    if (p.kind === 'combo') {
      g.globalAlpha = Math.max(0, 1 - p.t / p.max);
      const k = 1 + Math.max(0, 0.3 - p.t) * 2;
      g.scale(k, k);
      g.font = '800 16px "Malgun Gothic", sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 4; g.strokeStyle = '#120f1a';
      const txt = p.n === -1 ? '격퇴!' : `${p.n}연쇄!`;
      g.strokeText(txt, 0, -p.t * 18);
      g.fillStyle = (p.n ?? 2) >= 4 ? '#ff7ad9' : '#ffd38a';
      g.fillText(txt, 0, -p.t * 18);
    } else if (p.kind === 'coin') {
      g.globalAlpha = Math.max(0, 1 - p.t / p.max);
      g.font = '700 13px "Malgun Gothic", sans-serif';
      g.lineWidth = 3; g.strokeStyle = '#120f1a';
      g.strokeText('✧ +1', -14, -p.t * 26);
      g.fillStyle = '#ffd38a';
      g.fillText('✧ +1', -14, -p.t * 26);
    } else if (p.kind === 'heart') {
      g.globalAlpha = Math.max(0, 1 - p.t / p.max);
      g.fillStyle = '#ff8fb8';
      g.font = '16px sans-serif';
      for (let i = 0; i < 3; i++) g.fillText('♥', (i - 1) * 14 - 6, -p.t * 30 - i * 6);
    } else if (p.kind === 'spark') {
      // 부화 반짝임: 퍼지는 별 조각
      g.globalAlpha = Math.max(0, 1 - p.t / p.max);
      g.fillStyle = '#ffe9a8';
      g.font = '12px sans-serif';
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + p.t;
        const r = 10 + p.t * 34;
        g.fillText('✦', Math.cos(a) * r - 4, Math.sin(a) * r * 0.7);
      }
    } else if (p.kind === 'chest') {
      g.fillStyle = '#6b4120'; g.fillRect(-14, -18, 28, 18);
      g.fillStyle = '#8a5a2c'; g.fillRect(-14, -24, 28, 7);
      g.fillStyle = '#e8c160'; g.fillRect(-14, -18, 28, 2); g.fillRect(-2, -20, 4, 6);
      // 반짝임
      const tw = (Math.sin(p.t * 5) + 1) / 2;
      g.fillStyle = `rgba(255,236,150,${0.4 + tw * 0.6})`;
      g.font = '10px sans-serif';
      g.fillText('✦', 10, -26 - tw * 3);
    } else {
      g.fillStyle = '#4f8a3a'; g.beginPath(); g.ellipse(0, -6, 13, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#86c35a'; g.beginPath(); g.ellipse(-4, -10, 6, 4, -0.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(5, -11, 6, 4, 0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c9a36b'; g.fillRect(-2, -8, 4, 5);
    }
    g.restore();
  }
}

// ---------------------------------------------------------------- 계절 연출
interface Flake { x: number; y: number; vx: number; vy: number; r: number; ph: number }
const flakes: Flake[] = [];
type Season = 'snow' | 'petal' | 'firefly' | 'leaf';
function season(): Season {
  const m = new Date().getMonth() + 1;
  if (m === 12 || m <= 2) return 'snow';
  if (m <= 5) return 'petal';
  if (m <= 8) return 'firefly';
  return 'leaf';
}

function stepSeason(dt: number) {
  const on = model.perf === 'high' && model.season !== false;
  const kind = season();
  // 반딧불은 밤에만
  const want = !on ? 0 : kind === 'firefly' ? (isNight() ? 14 : 0) : kind === 'snow' ? 26 : 12;
  while (flakes.length < want) {
    flakes.push({ x: Math.random() * W, y: kind === 'firefly' ? rnd(H * 0.5, H) : -10 - Math.random() * H, vx: rnd(-12, 12), vy: kind === 'snow' ? rnd(18, 34) : kind === 'firefly' ? 0 : rnd(22, 40), r: rnd(2, 4), ph: Math.random() * 6 });
  }
  if (flakes.length > want) flakes.length = want;
  for (const f of flakes) {
    f.ph += dt;
    if (kind === 'firefly') {
      f.x += Math.sin(f.ph * 0.7) * 14 * dt;
      f.y += Math.cos(f.ph * 0.5) * 10 * dt;
    } else {
      f.x += (f.vx + Math.sin(f.ph * 1.3) * 18) * dt;
      f.y += f.vy * dt;
      if (f.y > H + 10) { f.y = -10; f.x = Math.random() * W; }
    }
    if (f.x < -20) f.x = W + 10;
    if (f.x > W + 20) f.x = -10;
  }
}

function drawSeason() {
  if (!flakes.length) return;
  const kind = season();
  g.save();
  for (const f of flakes) {
    if (kind === 'snow') {
      g.globalAlpha = 0.75;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(f.x, f.y, f.r * 0.8, 0, Math.PI * 2); g.fill();
    } else if (kind === 'firefly') {
      g.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(f.ph * 2));
      g.fillStyle = '#e9ff8a';
      g.shadowColor = '#d8ff6a'; g.shadowBlur = 8;
      g.beginPath(); g.arc(f.x, f.y, 2, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    } else {
      g.globalAlpha = 0.85;
      g.fillStyle = kind === 'petal' ? '#ffc2d6' : ['#d9772f', '#c4521f', '#e2a33a'][Math.floor(f.r * 10) % 3];
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.ph * 1.7);
      g.beginPath(); g.ellipse(0, 0, f.r * 1.6, f.r * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- 그리기
function cell(img: HTMLImageElement, c: number, r: number, cols: number, rows: number, x: number, y: number, w: number, h: number, flip = false) {
  if (!ready(img)) return;
  const sw = img.width / cols, sh = img.height / rows;
  if (flip) {
    g.save();
    g.translate(x + w, y);
    g.scale(-1, 1);
    g.drawImage(img, c * sw, r * sh, sw, sh, 0, 0, w, h);
    g.restore();
  } else g.drawImage(img, c * sw, r * sh, sw, sh, x, y, w, h);
}

/** 특별한 날 (컴퓨터 날짜) */
type Special = 'newyear' | 'valentine' | 'halloween' | 'pepero' | 'xmas' | null;
function specialDay(): Special {
  const d = new Date(), m = d.getMonth() + 1, day = d.getDate();
  if (m === 1 && day <= 2) return 'newyear';
  if (m === 2 && day === 14) return 'valentine';
  if (m === 10 && day === 31) return 'halloween';
  if (m === 11 && day === 11) return 'pepero';
  if (m === 12 && (day === 24 || day === 25)) return 'xmas';
  return null;
}
const SPECIAL_LINES: Record<Exclude<Special, null>, string[]> = {
  newyear: ['새해다! 올해도 하늘을 지배하자.', '새해 복 많이… 크릉.'],
  valentine: ['…초콜릿은 불에 녹는다고.', '누가 둥지 앞에 하트를 두고 갔다.'],
  halloween: ['호박 머리 인간들이 돌아다닌다?!', '사탕 안 주면 불태운다~'],
  pepero: ['막대 과자를 주고받는 날이라던데.', '…하나만 줘 봐.'],
  xmas: ['인간들이 반짝이는 나무를 세웠더군.', '선물은 보물 더미에 넣어 둬.'],
};

function drawSpecial() {
  const sp = specialDay();
  if (!sp) return;
  const r = nestRect();
  const base = r.y + r.h, t = performance.now() / 1000;
  g.save();
  if (sp === 'halloween') {
    for (const [dx, k] of [[-22, 1], [r.w + 24, 0.8]] as [number, number][]) {
      const x = r.x + dx;
      g.fillStyle = '#e8781e'; g.beginPath(); g.ellipse(x, base - 10 * k, 13 * k, 10 * k, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4c7a2a'; g.fillRect(x - 1.5, base - 23 * k, 3, 5 * k);
      g.fillStyle = `rgba(255,220,90,${0.7 + 0.3 * Math.sin(t * 6 + dx)})`;
      g.beginPath(); g.moveTo(x - 6 * k, base - 13 * k); g.lineTo(x - 3 * k, base - 9 * k); g.lineTo(x - 9 * k, base - 9 * k); g.fill();
      g.beginPath(); g.moveTo(x + 6 * k, base - 13 * k); g.lineTo(x + 9 * k, base - 9 * k); g.lineTo(x + 3 * k, base - 9 * k); g.fill();
    }
  } else if (sp === 'xmas' || sp === 'newyear') {
    const x = r.x + r.w / 2, y = r.y - 44;
    g.fillStyle = sp === 'xmas' ? '#ffe37a' : '#ffb3d1';
    g.shadowColor = g.fillStyle; g.shadowBlur = 10 + 4 * Math.sin(t * 3);
    g.font = '18px sans-serif'; g.textAlign = 'center';
    g.fillText(sp === 'xmas' ? '★' : '✺', x, y);
  } else {
    g.fillStyle = '#ff8fb8'; g.font = '14px sans-serif';
    for (let i = 0; i < 3; i++) g.fillText(sp === 'pepero' ? '▮' : '♥', r.x + 20 + i * 45, r.y - 36 - Math.abs(Math.sin(t * 2 + i)) * 6);
  }
  g.restore();
}

/** 둥지 장식: 유물로 들인 것들을 둥지 둘레에 그린다 */
function drawDecor() {
  const d = model.decor;
  if (!d?.length) return;
  const r = nestRect();
  const base = r.y + r.h;
  const t = performance.now() / 1000;
  g.save();
  if (d.includes('hoard')) {
    // 둥지 오른쪽 아래 금화 더미
    const x = r.x + r.w - 6;
    g.fillStyle = '#b8862b';
    g.beginPath(); g.ellipse(x, base - 4, 22, 9, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#e8c160';
    for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(x - 14 + i * 4.5, base - 7 - (i % 3) * 3, 4, 2, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = `rgba(255,240,170,${0.5 + 0.5 * Math.sin(t * 3)})`;
    g.font = '9px sans-serif'; g.fillText('✦', x + 6, base - 18);
  }
  if (d.includes('torch')) {
    for (const x of [r.x - 10, r.x + r.w + 14]) {
      g.fillStyle = '#5a3b22'; g.fillRect(x - 2, base - 38, 4, 38);
      const fl = Math.sin(t * 13 + x) * 2;
      g.fillStyle = '#ff9a2e'; g.beginPath(); g.ellipse(x, base - 44 + fl * 0.3, 5, 9 + fl, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffe28a'; g.beginPath(); g.ellipse(x, base - 42, 2.5, 5, 0, 0, Math.PI * 2); g.fill();
      if (isNight()) { g.fillStyle = 'rgba(255,170,60,0.12)'; g.beginPath(); g.arc(x, base - 40, 40, 0, Math.PI * 2); g.fill(); }
    }
  }
  if (d.includes('banner')) {
    const x = r.x + 10;
    g.fillStyle = '#4a3a2a'; g.fillRect(x, base - 80, 3, 80);
    const wave = Math.sin(t * 2.5) * 3;
    g.fillStyle = '#5b2a8c';
    g.beginPath(); g.moveTo(x + 3, base - 78); g.lineTo(x + 30 + wave, base - 72); g.lineTo(x + 26 + wave, base - 60); g.lineTo(x + 30 + wave, base - 50); g.lineTo(x + 3, base - 54); g.closePath(); g.fill();
    g.fillStyle = '#e0b7ff'; g.font = '10px sans-serif'; g.fillText('✦', x + 10 + wave * 0.5, base - 60);
  }
  if (d.includes('crystal')) {
    const x = r.x + r.w / 2 + 52, y = base - 6;
    const glow = 0.45 + 0.35 * Math.sin(t * 2);
    g.shadowColor = '#9fd8ff'; g.shadowBlur = 14 * glow;
    g.fillStyle = `rgba(150,215,255,${0.75 + glow * 0.2})`;
    g.beginPath(); g.moveTo(x, y - 30); g.lineTo(x + 8, y - 10); g.lineTo(x, y); g.lineTo(x - 8, y - 10); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x - 10, y - 16); g.lineTo(x - 5, y - 6); g.lineTo(x - 10, y); g.lineTo(x - 15, y - 6); g.closePath(); g.fill();
    g.shadowBlur = 0;
  }
  g.restore();
}

function drawSmoke() {
  const left = smokeUntil - performance.now();
  if (left <= 0) return;
  const r = nestRect();
  const t = performance.now() / 1000;
  g.save();
  for (let i = 0; i < 7; i++) {
    const ph = (t * 0.35 + i / 7) % 1;
    const x = r.x + r.w * (0.2 + 0.6 * ((i * 37) % 7) / 7) + Math.sin(t + i) * 8;
    const y = r.y + r.h * 0.4 - ph * 90;
    g.globalAlpha = Math.min(1, left / 15000) * (1 - ph) * 0.45;
    g.fillStyle = '#5b5560';
    g.beginPath(); g.arc(x, y, 8 + ph * 18, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function drawNest() {
  drawSmoke();
  drawDecor();
  drawSpecial();
  const r = nestRect();
  cell(imgs.nest, 0, 0, 2, 2, r.x, r.y - 6, r.w, r.w * (600 / 656));
  // 알
  model.eggs.forEach((egg, i) => {
    const ew = 34, eh = 40;
    const ex = r.x + r.w / 2 - ew * 1.5 + i * ew, ey = r.y + 6;
    g.save();
    if (egg.species > 4) g.filter = `hue-rotate(${egg.species * 29}deg)`;
    cell(imgs.nest, egg.left < 60 ? 0 : 1, egg.left < 60 ? 1 : 0, 2, 2, ex, ey, ew, eh);
    g.restore();
  });
}

/** 둥지 버튼은 드래곤에 가리지 않게 맨 위에 그린다 */
function drawNestButtons() {
  const noDragons = presentCount() === 0;
  for (const b of buttons()) {
    const disabled = b.id === 'control' && noDragons;
    const lit = b.id === 'control' && control;
    const hover = hoverKind === 'btn:' + b.id;
    g.save();
    g.globalAlpha = disabled ? 0.45 : 1;
    g.fillStyle = lit ? '#7b4fe0' : hover ? '#3a2d55' : '#1d1828e6';
    g.strokeStyle = lit ? '#e0c4ff' : '#6f5a95';
    g.lineWidth = lit ? 2 : 1;
    if (lit) { g.shadowColor = '#c48bff'; g.shadowBlur = 12 + Math.sin(performance.now() / 200) * 4; }
    roundRect(b.x, b.y, b.w, b.h, 8);
    g.fill();
    g.shadowBlur = 0;
    g.stroke();
    g.fillStyle = '#f2eaff';
    g.font = '600 12px "Malgun Gothic", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    g.restore();
  }
  if (hoverKind === 'btn:control' && noDragons) tooltip('표시 중인 드래곤이 없어요', mouse.x, mouse.y - 14);
}

function roundRect(x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function tooltip(text: string, x: number, y: number) {
  g.save();
  g.font = '12px "Malgun Gothic", sans-serif';
  const w = g.measureText(text).width + 16;
  const bx = Math.max(4, Math.min(W - w - 4, x - w / 2));
  g.fillStyle = '#120f1aee';
  g.strokeStyle = '#6f5a95';
  roundRect(bx, y - 24, w, 22, 6);
  g.fill();
  g.stroke();
  g.fillStyle = '#eee';
  g.textBaseline = 'middle';
  g.fillText(text, bx + 8, y - 13);
  g.restore();
}

function drawDragon(e: DragonE) {
  const sz = dragonSize(e.d);
  const flying = e.mode === 'fly' || e.mode === 'attackFly' || (e.mode === 'cast' && e.y < ground() - 5);
  const bob = flying ? Math.sin(e.anim * 6) * 4 : 0;
  const x = e.x - sz.w / 2, y = e.y - sz.h + bob;
  g.save();
  g.globalAlpha = e.alpha;
  const filters: string[] = [];
  const sp = e.d.species === 0 ? null : speciesRow(e.d.species);
  if (sp?.hue) filters.push(sp.hue);
  if (e.d.grade === 4) filters.push('drop-shadow(0 0 8px #d06cff)');
  else if (e.d.grade === 3) filters.push(`drop-shadow(0 0 ${4 + Math.sin(e.anim * 2) * 1.5}px #ffc96b)`);
  if (filters.length) g.filter = filters.join(' ');
  // 시트의 그림은 오른쪽을 본다
  const flip = e.facing < 0;
  if (e.d.species === 0) {
    if (flying && e.mode !== 'cast') {
      const f = Math.floor(e.anim * 8) % 4;
      const fw = sz.w * 1.25, fh = fw * (443 / 887);
      cell(imgs.flight, f % 2, Math.floor(f / 2), 2, 2, e.x - fw / 2, e.y - fh + bob, fw, fh, flip);
    } else {
      const [row, frames, fps] = e.mode === 'walk' ? [1, 8, 8] : e.mode === 'sleep' ? [0, 6, 2] : e.mode === 'cast' ? [7, 6, 8] : [5, 8, 4];
      cell(imgs.sheet, Math.floor(e.anim * fps) % frames, row, 8, 11, x, y, sz.w, sz.h, flip);
    }
  } else {
    const col = flying && e.mode !== 'cast' ? 3 : e.mode === 'walk' ? 1 : e.mode === 'cast' ? 2 : 0;
    const walkSheet = e.mode === 'walk' && hasSpeciesWalk();
    // 걷기 프레임 그림이 없으면 1장을 출렁임·기울기로 보완
    const walkBob = e.mode === 'walk' && !walkSheet ? Math.abs(Math.sin(e.anim * 9)) * 4 : 0;
    const tilt = e.mode === 'walk' && !walkSheet ? Math.sin(e.anim * 9) * 0.04 : flying ? Math.sin(e.anim * 3) * 0.06 : 0;
    g.translate(e.x, e.y - sz.h / 2 - walkBob + bob);
    g.rotate(tilt);
    if (walkSheet) cell(sheets.speciesWalk, Math.floor(e.anim * 7) % 4, e.d.species - 1, 4, 11, -sz.w / 2, -sz.h / 2, sz.w, sz.h, flip);
    else cell(sheets.species, col, sp!.row, 4, sp!.rows, -sz.w / 2, -sz.h / 2, sz.w, sz.h, flip);
  }
  g.restore();
  if (e.mode === 'sleep') {
    g.save();
    g.globalAlpha = 0.6 + Math.sin(e.anim * 2) * 0.3;
    g.fillStyle = '#d9c8ff';
    g.font = '600 13px sans-serif';
    g.fillText('z', e.x + sz.w * 0.25, e.y - sz.h * 0.75 - (e.anim * 8) % 12);
    g.restore();
  }
  if (e.speechT > 0 && e.alpha > 0.5) bubble(e.speech, e.x, e.y - sz.h - 6);
  else if (e.d.fighting && !e.d.away && e.alpha > 0.5) {
    // 레어에서 싸우는 중: 머리 위에 칼 표시
    g.save();
    g.font = '18px sans-serif';
    g.textAlign = 'center';
    g.globalAlpha = 0.7 + 0.3 * Math.sin(e.anim * 6);
    g.fillStyle = '#ff9a9a';
    g.fillText('⚔', e.x, e.y - sz.h - 8);
    g.restore();
  }
}

/** 마우스를 올린 드래곤의 이름표 (클릭은 그대로 바탕화면으로 간다) */
function nameTag(e: DragonE, x: number, y: number) {
  const name = (e.d.title ? `‘${e.d.title}’ ` : '') + e.d.name.split(' · ')[0];
  const grade = GRADES[e.d.grade] ?? '';
  const sub = `${grade}${e.d.adult ? '' : ' · 새끼'} · ${e.pers}`;
  g.save();
  g.font = '600 12px "Malgun Gothic", sans-serif';
  const w1 = g.measureText(name).width;
  g.font = '11px "Malgun Gothic", sans-serif';
  const w2 = g.measureText(sub).width;
  const w = w1 + w2 + 26;
  const bx = Math.max(4, Math.min(W - w - 4, x - w / 2));
  const by = Math.max(4, y - 24);
  g.fillStyle = '#120f1add';
  g.strokeStyle = GRADE_COLOR[e.d.grade] ?? '#6f5a95';
  roundRect(bx, by, w, 20, 7);
  g.fill();
  g.stroke();
  g.textBaseline = 'middle';
  g.font = '600 12px "Malgun Gothic", sans-serif';
  g.fillStyle = '#f2eaff';
  g.fillText(name, bx + 9, by + 10.5);
  g.font = '11px "Malgun Gothic", sans-serif';
  g.fillStyle = GRADE_COLOR[e.d.grade] ?? '#ccc';
  g.fillText(sub, bx + 17 + w1, by + 10.5);
  g.restore();
}

/** 이번 장면에 그린 말풍선 자리 (겹침 피하기) */
const bubbles: { x: number; y: number; w: number }[] = [];

function bubble(text: string, x: number, y: number) {
  g.save();
  g.font = '13px "Malgun Gothic", sans-serif';
  const t = text.length > 34 ? text.slice(0, 33) + '…' : text;
  const w = g.measureText(t).width + 20;
  const bx = Math.max(4, Math.min(W - w - 4, x - w / 2));
  let by = Math.max(4, y - 30);
  // 이미 그린 말풍선과 겹치면 위로 비켜 선다
  for (let k = 0; k < 6 && bubbles.some((b) => bx < b.x + b.w && bx + w > b.x && by < b.y + 28 && by + 28 > b.y); k++) by -= 30;
  bubbles.push({ x: bx, y: by, w });
  g.fillStyle = '#fbf7ffee';
  g.strokeStyle = '#8e5cf0';
  roundRect(bx, by, w, 26, 10);
  g.fill();
  g.stroke();
  g.fillStyle = '#24183d';
  g.textBaseline = 'middle';
  g.fillText(t, bx + 10, by + 13);
  g.restore();
}

function drawMonsterDesk(m: MonsterE) {
  // monsters-desk.png: 8열(걷기1~4·피격·기절1~2·일어남) × 4행, 칸 정사각형
  const img = sheets.monstersDesk;
  const h = MONSTER_H * 1.25, w = h;
  const col = m.mode === 'walk' ? Math.floor(m.anim * 5) % 4 : m.mode === 'idle' ? 0 : m.mode === 'hit' ? 4 : m.mode === 'stunned' ? 5 : 7;
  g.save();
  g.translate(m.x, ground());
  if (m.mode === 'hit') g.filter = 'brightness(1.8)';
  if (m.dir < 0) g.scale(-1, 1);
  const sw = img.width / 8, sh = img.height / 4;
  // 기절 중에는 숨 쉬듯 살짝 들썩이게
  const breathe = m.mode === 'stunned' ? 1 + Math.sin(m.anim * 3) * 0.03 : 1;
  g.drawImage(img, col * sw, m.kind * sh, sw, sh, -w / 2, -h * breathe, w, h * breathe);
  g.restore();
}

function drawMonster(m: MonsterE) {
  if (hasMonstersDesk()) { drawMonsterDesk(m); drawMonsterExtras(m, MONSTER_H); return; }
  const img = imgs.monsters;
  if (!ready(img)) return;
  const sw = img.width / 4;
  const sy = MONSTER_CUTS[m.kind] * img.height, sh = (MONSTER_CUTS[m.kind + 1] - MONSTER_CUTS[m.kind]) * img.height;
  const h = MONSTER_H, w = h * (sw / sh);
  const frame = m.mode === 'walk' ? Math.floor(m.anim * 6) % 4 : 0;
  g.save();
  g.translate(m.x, ground());
  if (m.mode === 'stunned' || m.mode === 'recover') {
    const k = m.mode === 'stunned' ? 1 : Math.max(0, m.timer / 0.5);
    g.globalAlpha = 1 - 0.4 * k;
    g.rotate(m.dir * -1.2 * k);
  }
  if (m.mode === 'hit') g.filter = 'brightness(2.5)';
  if (m.dir > 0) g.scale(-1, 1); // 기본 monsters.png 의 몬스터는 왼쪽을 본다
  g.drawImage(img, frame * sw, sy, sw, sh, -w / 2, -h, w, h);
  g.restore();
  drawMonsterExtras(m, h, w);
}

function drawMonsterExtras(m: MonsterE, h: number, w = h * 1.1) {
  if (m.mode === 'stunned' && !hasMonstersDesk()) { // 새 기절 그림에는 별이 그려져 있다
    g.save();
    for (let i = 0; i < 3; i++) {
      const a = m.anim * 4 + (i * Math.PI * 2) / 3;
      g.fillStyle = '#ffe680';
      g.font = '12px sans-serif';
      g.fillText('★', m.x + Math.cos(a) * 16 - 6, ground() - h * 0.55 + Math.sin(a) * 5);
    }
    g.restore();
  }
  if (control && hoverKind === 'monster' && hovered === m) {
    g.save();
    g.strokeStyle = '#ff9a9a';
    g.setLineDash([4, 3]);
    g.strokeRect(m.x - w / 2 - 3, ground() - h - 3, w + 6, h + 4);
    g.restore();
  }
}

function drawEffect() {
  if (!effect || effect.t < 0) return;
  const k = effect.t / EFFECT_TIME;
  const scale = model.perf === 'low' ? 0.5 : 1;
  const e = effect.from, m = effect.target;
  const mx = m.x, my = ground() - MONSTER_H / 2;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, (1 - k) * 2.2);
  if (effect.skill === 0) {
    // 브레스: 드래곤 입에서 몬스터 쪽으로 늘어나는 불길
    const sx = e.x + e.facing * dragonSize(e.d).w * 0.35, sy = e.y - dragonSize(e.d).h * 0.6;
    const ang = Math.atan2(my - sy, mx - sx);
    const len = Math.hypot(mx - sx, my - sy) * Math.min(1, k * 2.2) + 40;
    g.translate(sx, sy);
    g.rotate(ang);
    // 시트의 브레스는 왼쪽(입)이 가늘고 오른쪽으로 퍼진다
    cell(imgs.fx, 0, 0, 2, 2, 0, -60 * scale, len, 120 * scale);
  } else if (effect.skill === 1) {
    // 발톱: 몬스터 위에서 세 번 번쩍
    const flash = Math.floor(k * 6) % 2 === 0;
    if (flash) cell(imgs.fx, 1, 0, 2, 2, mx - 70 * scale, my - 70 * scale, 140 * scale, 140 * scale);
  } else if (effect.skill === 2) {
    // 포효: 드래곤 중심에서 퍼지는 충격파
    const r = (60 + k * 220) * scale;
    cell(imgs.fx, 0, 1, 2, 2, e.x - r, e.y - dragonSize(e.d).h / 2 - r, r * 2, r * 2);
  } else {
    // 낙성 강습: 위에서 내리꽂힘
    const fall = Math.min(1, k * 2);
    const size = 180 * scale;
    cell(imgs.fx, 1, 1, 2, 2, mx - size / 2, my - size * 0.85 - (1 - fall) * 220, size, size);
  }
  g.restore();
  // 파티클 (고사양만)
  if (model.perf === 'high' && effect.hitDone) {
    g.save();
    for (let i = 0; i < 10; i++) {
      const a = i * 0.63 + effect.t * 3;
      const r = 10 + (effect.t - EFFECT_TIME * 0.45) * 120;
      g.globalAlpha = Math.max(0, 1 - k);
      g.fillStyle = i % 2 ? '#e3b5ff' : '#ff9ad5';
      g.fillRect(mx + Math.cos(a) * r, my + Math.sin(a) * r * 0.6, 3, 3);
    }
    g.restore();
  }
}

// ---------------------------------------------------------------- 입력 (클릭 통과 제어)
let hovered: MonsterE | DragonE | HumanE | null = null;
/** 이름표를 띄울 드래곤 (조종 모드가 아니어도 커서 위치만 보고 정한다) */
let tagged: DragonE | null = null;

function inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function monsterRect(m: MonsterE) {
  const w = MONSTER_H * 1.1;
  return { x: m.x - w / 2, y: ground() - MONSTER_H, w, h: MONSTER_H };
}

function dragonRect(e: DragonE) {
  const sz = dragonSize(e.d);
  return { x: e.x - sz.w * 0.35, y: e.y - sz.h * 0.85, w: sz.w * 0.7, h: sz.h * 0.75 };
}

function hitTest(x: number, y: number): { kind: string; obj?: MonsterE | DragonE | HumanE } | null {
  for (const b of buttons()) if (inRect(x, y, b)) return { kind: 'btn:' + b.id };
  if (control) {
    // 방어전 동안은 침입자를 먼저, 몬스터는 클릭 대상에서 뺀다
    for (const h of humans) if (!h.gone && h.mode !== 'flee' && inRect(x, y, humanRect(h, defense))) return { kind: 'monster', obj: h };
    if (!defense) for (const m of monsters) if (inRect(x, y, monsterRect(m))) return { kind: 'monster', obj: m };
  }
  if (control) for (const e of [...dragons.values()].reverse()) if (!e.gone && e.alpha > 0.5 && inRect(x, y, dragonRect(e))) return { kind: 'dragon', obj: e };
  if (inRect(x, y, nestRect())) return { kind: 'nest' };
  return null;
}

/** 클릭을 받아야 하는 영역을 메인 프로세스에 알린다. 메인이 커서 위치로 클릭 통과를 정한다. */
let lastRegions = '';
function sendRegions() {
  const r: { x: number; y: number; w: number; h: number }[] = [];
  if (visible) {
    if (dragging) r.push({ x: 0, y: 0, w: W, h: H }); // 끄는 동안에는 창 전체가 클릭을 받는다
    for (const b of buttons()) r.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    r.push(nestRect());
    if (control) {
      for (const e of dragons.values()) if (!e.gone && e.alpha > 0.5) r.push(dragonRect(e));
      if (!defense) for (const m of monsters) r.push(monsterRect(m));
      for (const h of humans) if (!h.gone && h.mode !== 'flee') r.push(humanRect(h, defense));
    }
  }
  const rounded = r.map((x) => ({ x: Math.round(x.x), y: Math.round(x.y), w: Math.round(x.w), h: Math.round(x.h) }));
  const key = JSON.stringify(rounded);
  if (key !== lastRegions) {
    lastRegions = key;
    api.setRegions(rounded);
  }
}

function updateHover() {
  const h = dragging ? { kind: 'nest' } : hitTest(mouse.x, mouse.y);
  hoverKind = h?.kind ?? null;
  hovered = (h as { obj?: MonsterE | DragonE | HumanE } | null)?.obj ?? null;
  tagged = null;
  if (!h || h.kind === 'dragon') {
    for (const e of [...dragons.values()].reverse()) {
      if (present(e) && e.alpha > 0.5 && inRect(mouse.x, mouse.y, dragonRect(e))) { tagged = e; break; }
    }
  }
  canvas.style.cursor = !h ? 'default' : h.kind === 'monster' ? 'crosshair' : h.kind === 'nest' ? (dragging ? 'grabbing' : 'grab') : 'pointer';
}

function onDown(ev: MouseEvent) {
  if (ev.button !== 0) return;
  mouse = { x: ev.clientX, y: ev.clientY };
  const h = hitTest(mouse.x, mouse.y);
  if (!h) return;
  if (h.kind === 'btn:control') { if (presentCount()) setControl(!control); return; }
  if (h.kind === 'btn:manager') { api.openManager(); return; }
  if (h.kind === 'monster') { attack(h.obj as Target); return; }
  if (h.kind === 'dragon') {
    const e = h.obj as DragonE;
    if (e.guest === undefined) {
      // 쓰다듬기: 기력 조금 회복 (드래곤마다 잠시 간격)
      void api.pet(e.d.id).then((err) => {
        if (!err) {
          props.push({ kind: 'heart', x: e.x, y: e.y - dragonSize(e.d).h * 0.8, t: 0, max: 1.6 });
          e.speech = pickLine(['크릉… 기분 좋다.', '♡', '조금 더…', '흥, 싫진 않군.']);
          e.speechT = 2.5;
        }
      });
    }
    e.speech = pickLine(PERS_LINES[e.pers].concat(LINES.slice(0, 2)));
    e.speechT = 2.5;
    if (e.mode === 'walk' || e.mode === 'idle' || e.mode === 'sleep') { e.mode = 'idle'; e.timer = 2.5; }
    return;
  }
  if (h.kind === 'nest') { dragging = { dx: mouse.x - nest.x, dy: mouse.y - nest.y }; sendRegions(); }
}

function onMove(ev: MouseEvent) {
  mouse = { x: ev.clientX, y: ev.clientY };
  if (dragging) nest = clampNest(mouse.x - dragging.dx, mouse.y - dragging.dy);
  updateHover();
}

function onUp() {
  if (dragging) {
    dragging = null;
    api.saveNest(nest);
    sendRegions();
    updateHover();
  }
}

// ---------------------------------------------------------------- 루프
let lastT = performance.now();
let acc = 0;
let regionClock = 0;
/** 그리기 비용 측정 (최근 평균 ms) */
const perf = { avg: 0, n: 0 };
(window as unknown as { __bfPerf: () => typeof perf }).__bfPerf = () => perf;

function frame(now: number) {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  try { frameBody(now); } finally {
    const ms = performance.now() - t0;
    perf.avg = perf.avg * 0.95 + ms * 0.05;
    perf.n++;
  }
}

function frameBody(now: number) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (!visible) return;
  acc += dt;
  const minStep = model.perf === 'low' ? 1 / 30 : 1 / 61;
  if (acc < minStep) return;
  const step = acc;
  acc = 0;

  regionClock += step;
  if (regionClock >= 0.08 || dragging) { regionClock = 0; sendRegions(); if (!dragging) updateHover(); }
  stepDefense(now);
  if (control && now - controlSince > CONTROL_TIMEOUT) setControl(false);
  for (const e of dragons.values()) stepDragon(e, step);
  for (const [id, e] of dragons) if (e.gone && e.alpha <= 0) dragons.delete(id);
  for (const m of monsters) stepMonster(m, step);
  stepHumans(step, now);
  stepSeason(step);
  stepEffect(step);
  if (skillText) { skillText.t -= step; if (skillText.t <= 0) skillText = null; }

  g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  g.clearRect(0, 0, W, H);
  bubbles.length = 0;
  drawSeason();
  drawNest();
  for (const m of monsters) drawMonster(m);
  drawProps();
  const order = [...dragons.values()].sort((a, b) => a.y - b.y);
  for (const e of order) if (e.alpha > 0.01 && !(e.hidden && e.alpha <= 0.01)) drawDragon(e);
  // 인간은 땅 위 드래곤들보다 앞에 그려 잘 보이게 한다
  for (const h of humans) drawHuman(h);
  drawNestButtons();
  // 이름표는 겹친 드래곤들에 가리지 않게 맨 위에 그린다
  if (tagged && !tagged.gone && tagged.speechT <= 0 && tagged.alpha > 0.5 && !dragging) {
    const t = tagged;
    nameTag(t, t.x, t.y - dragonSize(t.d).h - 4 + (t.mode === 'fly' || t.mode === 'attackFly' ? Math.sin(t.anim * 6) * 4 : 0));
  }
  drawEffect();
  if (skillText) {
    g.save();
    g.globalAlpha = Math.min(1, skillText.t);
    g.font = '700 15px "Malgun Gothic", sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 4;
    g.strokeStyle = '#120f1a';
    g.strokeText(skillText.text, skillText.x, skillText.y);
    g.fillStyle = '#f0d6ff';
    g.fillText(skillText.text, skillText.x, skillText.y);
    g.restore();
  }
  if (control && !dragging) {
    // 남은 조종 시간 표시
    const left = Math.ceil((CONTROL_TIMEOUT - (now - controlSince)) / 1000);
    const r = nestRect();
    g.save();
    g.font = '600 12px "Malgun Gothic", sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 3;
    g.strokeStyle = '#120f1a';
    // 둥지가 화면 위쪽에 있으면 안내 문구를 둥지 아래에 쓴다
    const ty = r.y - 38 > 14 ? r.y - 38 : r.y + r.h + 18;
    const msg = defense && model.raid
      ? `⚔ 레어 습격! 침입자를 클릭해 막으세요 · 격퇴 ${model.raid.defended}/${model.raid.max}`
      : `몬스터를 클릭하세요 · ${left}초`;
    if (defense) { g.font = '700 14px "Malgun Gothic", sans-serif'; }
    g.strokeText(msg, r.x + r.w / 2, ty);
    g.fillStyle = defense ? '#ffb4b4' : '#f0e4ff';
    g.fillText(msg, r.x + r.w / 2, ty);
    g.restore();
  }
}

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * devicePixelRatio);
  canvas.height = Math.round(H * devicePixelRatio);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  nest = model.nest ? clampNest(model.nest.x, model.nest.y) : clampNest(W - NEST_W - 220, H);
  for (const e of dragons.values()) if (e.mode === 'walk' || e.mode === 'idle' || e.mode === 'sleep') e.y = ground();
}

export async function startOverlay(a: DesktopApi) {
  api = a;
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  document.getElementById('root')!.replaceWith(canvas);
  canvas.style.display = 'block';
  resize();
  for (let k = 0; k < 4; k++) {
    monsters.push({ kind: k, x: rnd(80, W - 80), dir: Math.random() < 0.5 ? 1 : -1, speed: rnd(30, 60), mode: 'walk', timer: rnd(2, 6), anim: Math.random() * 4 });
  }
  void MONSTER_NAMES;
  applyModel(await api.init());
  resize();
  api.onModel(applyModel);
  api.onVisible((v) => {
    visible = v;
    if (!v) { setControl(false); dragging = null; }
    sendRegions();
    lastT = performance.now();
  });
  api.onNotice((n) => {
    const e = dragons.get(n.dragon);
    if (e) { e.speech = n.text; e.speechT = 5; }
  });
  api.onHuman(onHumanEvent);
  // 개발 확인용: 콘솔에서 __bfHuman('tribute') 처럼 부를 수 있다
  (window as unknown as { __bfHuman: (t: HumanEvent['type'], sp?: number) => void }).__bfHuman = (type, sp) => onHumanEvent({ type, species: sp ?? 3, why: 'egg' });
  api.onCursor((p) => {
    if (dragging) return; // 끄는 중에는 창의 실제 마우스 이벤트를 쓴다
    mouse = p;
    updateHover();
  });
  // 살아 있음 알림(1초): 그리기가 멈추면 메인 프로세스가 다시 띄운다
  setInterval(() => api.alive(), 1000);
  api.onRecheck(() => {
    lastRegions = '';
    dragging = null;
    resize();
    sendRegions();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  document.addEventListener('mouseleave', () => { mouse = { x: -1, y: -1 }; updateHover(); });
  requestAnimationFrame(frame);
}
