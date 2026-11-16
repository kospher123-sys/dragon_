// 생활 스킬 12개의 바탕화면 상호작용 (v1.6.0).
// 오버레이 창은 클릭 통과라 '커서 올리기'로 판정한다(메인 프로세스가 커서 좌표를 계속 보내 준다).
// 판정이 끝나면 host.reward → 엔진 act({ type: 'life' }) 에서 보상·하루 한도를 처리한다 (src/engine/life.ts).
import type { LifeKey } from '../../engine/life';

export interface LifeDragon { id: string; species: number; x: number; y: number; w: number; h: number; hurt: boolean; home: number }
export interface LifeHost {
  W(): number; H(): number; ground(): number;
  mouse(): { x: number; y: number };
  /** 바탕화면에 나와 있는 드래곤 */
  dragons(): LifeDragon[];
  say(id: string, text: string, t?: number): void;
  /** 그 드래곤의 생활 스킬 모션을 튼다 (안 되면 false) */
  cast(id: string): boolean;
  reward(key: LifeKey, id?: string, n?: number, miss?: boolean): Promise<string | null>;
  enabled(): boolean;
  winter(): boolean;
  img(name: string): HTMLImageElement | undefined;
}

const MIN = 60_000;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const near = (ax: number, ay: number, bx: number, by: number, r: number) => (ax - bx) ** 2 + (ay - by) ** 2 <= r * r;
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem('bf-life-' + k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem('bf-life-' + k, JSON.stringify(v)); } catch { /* 저장 안 돼도 놀이는 계속 */ } },
};

let host: LifeHost;
const pop: { text: string; x: number; y: number; t: number; color: string }[] = [];
function popText(text: string, x: number, y: number, color = '#ffe3a3') {
  // 가까운 자리에 이미 떠 있는 글자가 있으면 위로 쌓는다
  const stack = pop.filter((p) => p.t < 1.5 && Math.abs(p.x - x) < 120 && Math.abs(p.y - y) < 60).length;
  pop.push({ text, x, y: y - stack * 16, t: 0, color });
}
async function give(key: LifeKey, x: number, y: number, label: string, id?: string, n?: number) {
  const err = await host.reward(key, id, n);
  popText(err ? err : label, x, y, err ? '#c9c2d6' : '#ffe3a3');
  return !err;
}
const bySpecies = (sp: number) => host.dragons().filter((d) => d.species === sp);
const first = (sp: number) => bySpecies(sp)[0];

// ---------------------------------------------------------------- 0 흑염룡 잿불 묻기
let ember: { level: number; done: boolean } | null = null;
function initEmber() {
  const last = store.get<number>('alive', 0);
  const off = last ? (Date.now() - last) / 3_600_000 : 0;
  ember = off >= 0.25 ? { level: off < 1 ? 1 : off < 6 ? 2 : 3, done: false } : null;
  setInterval(() => store.set('alive', Date.now()), MIN);
  store.set('alive', Date.now());
}
/** 쓰다듬기가 성공했을 때 오버레이가 부른다 */
export function lifeOnPet(id: string, x: number, y: number) {
  if (!ember || ember.done || !host.enabled() || !first(0)) return;
  ember.done = true;
  const name = ['', '불씨', '잉걸', '재'][ember.level];
  void give('ember', x, y - 40, `잿불 묻기 · ${name} · 레어 기력 +${ember.level * 5}`, id, ember.level);
}

// ---------------------------------------------------------------- 1 레드 구들돌
interface Stone { fx: number; at: number; warmedAt?: number }
let stone: Stone | null = null;
const STONE_LIFE = 6 * 3_600_000;
const warmth = (s: Stone) => Math.max(0, 1 - (Date.now() - s.at) / STONE_LIFE);
function placeStone(x: number) {
  if (stone && warmth(stone) > 0.3) return;
  stone = { fx: x / host.W(), at: Date.now() };
  store.set('stone', stone);
}

// ---------------------------------------------------------------- 2 블루 물때
const TIDE = (12 * 60 + 25) * MIN;
const tideLevel = () => (Math.cos((Date.now() % TIDE) / TIDE * Math.PI * 2) + 1) / 2; // 1 만조, 0 간조
const tideCycle = () => Math.floor(Date.now() / TIDE);
let shells: { fx: number; got: boolean }[] = [];
let shellCycle = -1;

// ---------------------------------------------------------------- 3 에메랄드 꽃시계
const segment = () => { const h = new Date().getHours(); return h >= 5 && h < 10 ? 0 : h >= 10 && h < 16 ? 1 : h >= 16 && h < 21 ? 2 : 3; };
const segKey = () => { const d = new Date(); if (d.getHours() < 5) d.setDate(d.getDate() - 1); return `${d.toDateString()}-${segment()}`; };
const FLOWER = ['나팔꽃', '민들레', '분꽃', '달맞이꽃'];

// ---------------------------------------------------------------- 4 백은 귀환 등대
let beacon: { side: -1 | 1; t: number; id: string } | null = null;
let nextBeacon = performance.now() + rnd(8, 16) * MIN;
/** 백은이 바탕화면으로 돌아왔을 때 */
export function lifeOnReturn(id: string, species: number) {
  if (species === 4 && host.enabled() && !beacon) beacon = { side: Math.random() < 0.5 ? -1 : 1, t: 0, id };
}

// ---------------------------------------------------------------- 5 루비 광채 분산
let sparkles: { x: number; y: number; t: number }[] = [];
let nextSparkle = performance.now() + rnd(6, 14) * MIN;
function scatter(rubyX: number) {
  const m = host.mouse(), W = host.W();
  const mx = m.x >= 0 ? m.x : rnd(0, W);
  const cx = Math.max(20, Math.min(W - 20, 2 * rubyX - mx));
  sparkles = Array.from({ length: 7 }, (_, i) => ({ x: Math.max(10, Math.min(W - 10, cx + (i - 3) * 26)), y: host.ground() - 6 - (i % 2) * 8, t: 0 }));
}

// ---------------------------------------------------------------- 6 호박 8자 춤
let dance: { id: string; side: -1 | 1; t: number } | null = null;
let nextDance = performance.now() + rnd(10, 20) * MIN;

// ---------------------------------------------------------------- 7 화산 간헐천 예보
let geyser: { next: number; len: number; burst: number } = { next: performance.now() + rnd(3, 6) * MIN, len: 3, burst: -1 };

// ---------------------------------------------------------------- 8 흑요석 정밀 봉합
let suture: { target: string; dots: { x: number; y: number }[]; i: number; t: number } | null = null;
let nextSuture = performance.now() + rnd(4, 10) * MIN;

// ---------------------------------------------------------------- 9 황금 사금 일기
let pan: { x: number; swings: number; dir: number; last: number; lastX: number } | null = null;
let nextPan = performance.now() + 20 * MIN;

// ---------------------------------------------------------------- 10 서리 눈송이 받기
let flake: { x: number; y: number; kind: number; t: number } | null = null;
let nextFlake = performance.now() + rnd(20, 40) * MIN;
const nightHour = () => { const h = new Date().getHours(); return h >= 18 || h < 6; };

// ---------------------------------------------------------------- 11 폭풍 섬광과 천둥
let flash: { x: number; t: number; delay: number; caught: boolean } | null = null;
let nextFlash = performance.now() + rnd(15, 30) * MIN;

// ---------------------------------------------------------------- 시작·진행

export function startLife(h: LifeHost) {
  host = h;
  initEmber();
  stone = store.get<Stone | null>('stone', null);
  (window as unknown as { __bfLife: (key: LifeKey) => void }).__bfLife = (key) => trigger(key, true);
}

/** 생활 스킬 모션이 나올 때(오버레이 tryLifeSkill) 그 종족 놀이를 바로 띄운다 */
export function lifeOnCast(id: string, species: number, x: number) {
  if (!host.enabled()) return;
  if (species === 1) placeStone(x);
  if (species === 5) scatter(x);
  void id;
}

/** 개발 확인용·연출용: 그 놀이를 지금 띄운다 */
function trigger(key: LifeKey, force = false) {
  const W = host.W(), now = performance.now();
  const pick = (sp: number) => first(sp) ?? (force ? { id: 'test', species: sp, x: W / 2, y: host.ground(), w: 170, h: 120, hurt: true, home: 0 } : undefined);
  switch (key) {
    case 'ember': ember = { level: 2, done: false }; break;
    case 'stone': { const d = pick(1); if (d) { stone = null; placeStone(d.x + 90); } break; }
    case 'shell': shellCycle = -2; break;
    case 'flower': store.set('flower', ''); break;
    case 'beacon': { const d = pick(4); if (d) beacon = { side: 1, t: 0, id: d.id }; break; }
    case 'sparkle': { const d = pick(5); if (d) scatter(d.x); break; }
    case 'dance': { const d = pick(6); if (d) dance = { id: d.id, side: Math.random() < 0.5 ? -1 : 1, t: 0 }; break; }
    case 'geyser': geyser.next = now + 3000; break;
    case 'suture': { const d = pick(8); if (d) startSuture(d.x, force ? d.id : undefined); break; }
    case 'gold': { const d = pick(9); if (d) pan = { x: d.x + 110, swings: 0, dir: 0, last: 0, lastX: -1 }; break; }
    case 'snow': flake = { x: rnd(W * 0.2, W * 0.8), y: -30, kind: Math.floor(Math.random() * 24), t: 0 }; break;
    case 'flash': flash = { x: rnd(W * 0.15, W * 0.85), t: 0, delay: Math.round(rnd(1, 5)), caught: false }; break;
  }
}

function startSuture(x: number, target?: string) {
  const hurt = target ?? host.dragons().find((d) => d.hurt && d.home === 0)?.id;
  if (!hurt) return;
  const W = host.W(), gy = host.ground();
  const cx = Math.max(140, Math.min(W - 140, x));
  // 바늘자리: 지그재그 6점
  const dots = Array.from({ length: 6 }, (_, i) => ({ x: cx - 125 + i * 50, y: gy - 150 + (i % 2 ? 40 : 0) - Math.sin(i) * 10 }));
  suture = { target: hurt, dots, i: 0, t: 0 };
}

export function stepLife(dt: number, now: number) {
  for (const p of pop) p.t += dt;
  while (pop.length && pop[0].t > 2.2) pop.shift();
  if (!host || !host.enabled()) return;
  const W = host.W(), gy = host.ground();
  const m = host.mouse();
  const has = (m.x >= 0);

  // 1 구들돌: 커서를 올리면 온기
  if (stone) {
    const sx = stone.fx * W, w = warmth(stone);
    if (w <= 0) { stone = null; store.set('stone', null); }
    else if (has && near(m.x, m.y, sx, gy - 8, 22)) {
      const red = first(1);
      if (!stone.warmedAt || Date.now() - stone.warmedAt > 30 * MIN) {
        stone.warmedAt = Date.now(); store.set('stone', stone);
        if (w > 0.5 && red) void give('stone', sx, gy - 30, `구들돌 온기 ${Math.round(w * 100)}% · 레드 기력 +4`, red.id);
        else popText(`구들돌 온기 ${Math.round(w * 100)}%`, sx, gy - 30);
      }
    }
  }

  // 2 물때: 간조 때 조개
  if (first(2)) {
    const cyc = tideCycle();
    if (shellCycle !== cyc && (tideLevel() < 0.25 || shellCycle === -2)) {
      shellCycle = cyc;
      const got = store.get<number>('shells', -1) === cyc;
      shells = got ? [] : Array.from({ length: 3 }, () => ({ fx: rnd(0.1, 0.9), got: false }));
    }
    if (tideLevel() >= 0.4 && shellCycle !== -2) shells = shells.filter((s) => s.got);
    for (const s of shells) if (!s.got && has && near(m.x, m.y, s.fx * W, gy - 6, 18)) {
      s.got = true;
      if (shells.every((x) => x.got)) store.set('shells', tideCycle());
      void give('shell', s.fx * W, gy - 26, '조개 · 유물 +1');
    }
  }

  // 3 꽃시계: 구간마다 1번
  const em = first(3);
  if (em && store.get('flower', '') !== segKey()) {
    const fx = em.x + em.w * 0.6, fy = gy - 14;
    if (has && near(m.x, m.y, fx, fy, 26)) {
      store.set('flower', segKey());
      void give('flower', fx, fy - 30, `${FLOWER[segment()]} · 기력 +3`, em.id);
    }
  }

  // 4 귀환 등대
  const silver = first(4);
  if (silver && !beacon && now > nextBeacon) { nextBeacon = now + rnd(20, 40) * MIN; beacon = { side: Math.random() < 0.5 ? -1 : 1, t: 0, id: silver.id }; }
  if (beacon) {
    beacon.t += dt;
    const bx = beacon.side < 0 ? 18 : W - 18;
    if (has && Math.abs(m.x - bx) < 40 && m.y > host.H() * 0.15) { const id = beacon.id; beacon = null; void give('beacon', bx + (bx < W / 2 ? 60 : -60), host.H() * 0.5, '귀환 등대 · 백은 기력 +8', id === 'test' ? undefined : id); }
    else if (beacon.t > 8) beacon = null;
  }

  // 5 광채 분산: 반짝임을 밟은 드래곤
  const ruby = first(5);
  if (ruby && !sparkles.length && now > nextSparkle) { nextSparkle = now + rnd(15, 30) * MIN; if (host.cast(ruby.id)) scatter(ruby.x); }
  if (sparkles.length) {
    for (const s of sparkles) s.t += dt;
    for (const d of host.dragons()) for (const s of sparkles) if (s.t < 20 && Math.abs(d.x - s.x) < 16 && Math.abs(d.y - gy) < 30) {
      s.t = 99;
      void give('sparkle', s.x, gy - 40, '반짝임 · 기력 +2', d.id);
    }
    sparkles = sparkles.filter((s) => s.t < 20);
  }

  // 6 8자 춤: 기울기로 가리킨 쪽 가장자리로 커서를 옮긴다
  const amber = first(6);
  if (amber && !dance && now > nextDance) { nextDance = now + rnd(15, 30) * MIN; dance = { id: amber.id, side: Math.random() < 0.5 ? -1 : 1, t: 0 }; host.say(amber.id, '(8자 춤을 춘다…)', 4); }
  if (dance) {
    dance.t += dt;
    if (dance.t > 4 && has) {
      const at = m.x < W * 0.1 ? -1 : m.x > W * 0.9 ? 1 : 0;
      if (at) {
        const ok = at === dance.side, id = dance.id;
        dance = null;
        if (ok) void give('dance', at < 0 ? 120 : W - 120, host.H() * 0.5, '8자 춤 해독 · 다음 사냥 유물 +10%');
        else host.say(id, '아니야, 반대쪽!', 2.5);
      }
    }
    if (dance && dance.t > 14) { host.say(dance.id, '…못 알아들었구나.', 2.5); dance = null; }
  }

  // 7 간헐천 예보
  const vol = first(7);
  if (vol && now > geyser.next && geyser.burst < 0) {
    geyser.burst = 0;
    geyser.len = Math.round(rnd(2, 6));
  }
  if (geyser.burst >= 0) {
    geyser.burst += dt;
    const gx = (vol?.x ?? W / 2) + 120;
    if (geyser.burst >= geyser.len) {
      const ok = has && vol && Math.abs(m.x - gx) < 160 && m.y > gy - 260;
      if (vol) {
        if (ok) void give('geyser', gx, gy - 160, '간헐천 예보 적중 · 레어 기력 +4');
        else void host.reward('geyser', undefined, 0, true);
      }
      geyser.next = now + geyser.len * 3 * MIN;
      geyser.burst = -1;
    }
  }

  // 8 정밀 봉합: 점 6개를 순서대로
  const obs = first(8);
  if (obs && !suture && now > nextSuture) { nextSuture = now + rnd(10, 20) * MIN; startSuture(obs.x); }
  if (suture) {
    suture.t += dt;
    const p = suture.dots[suture.i];
    if (has && p && near(m.x, m.y, p.x, p.y, 16)) {
      suture.i++;
      if (suture.i >= suture.dots.length) {
        const id = suture.target, last = suture.dots[5];
        suture = null;
        void give('suture', last.x, last.y - 30, '정밀 봉합 · 부상 −25%', id === 'test' ? undefined : id);
      }
    }
    if (suture && suture.t > 8) { popText('봉합 실패', suture.dots[0].x, suture.dots[0].y - 20, '#c9c2d6'); suture = null; }
  }

  // 9 사금 일기: 접시 위에서 0.8~1.5초 리듬으로 좌우 흔들기
  const gold = first(9);
  if (gold && !pan && now > nextPan) { nextPan = now + 20 * MIN; pan = { x: gold.x + 110, swings: 0, dir: 0, last: now, lastX: -1 }; }
  if (pan) {
    const px = Math.max(40, Math.min(W - 40, pan.x));
    if (has && Math.abs(m.x - px) < 160 && m.y > gy - 200) {
      if (pan.lastX >= 0) {
        const dx = m.x - pan.lastX;
        const dir = Math.abs(dx) < 2 ? pan.dir : Math.sign(dx);
        if (pan.dir && dir !== pan.dir) {
          const gap = (now - pan.last) / 1000;
          pan.last = now;
          if (gap < 0.5) { pan.swings = 0; popText('너무 빨라서 쏟았다!', px, gy - 50, '#c9c2d6'); }
          else if (gap >= 0.8 && gap <= 1.5) pan.swings++;
        }
        pan.dir = dir;
      }
      pan.lastX = m.x;
      if (pan.swings >= 10) { pan = null; void give('gold', px, gy - 50, '사금 1알 · 다음 사냥 유물 +5%'); }
    }
    if (pan && now - pan.last > 120_000 && pan.swings > 0) pan.swings = 0;
  }

  // 10 눈송이 받기
  const frost = first(10);
  if (frost && !flake && now > nextFlake && (nightHour() || host.winter())) { nextFlake = now + rnd(20, 40) * MIN; flake = { x: rnd(W * 0.15, W * 0.85), y: -30, kind: Math.floor(Math.random() * 24), t: 0 }; }
  if (flake) {
    flake.t += dt;
    flake.y = Math.min(gy - 30, -30 + flake.t * 34);
    flake.x += Math.sin(flake.t * 1.3) * 20 * dt;
    if (has && near(m.x, m.y, flake.x, flake.y, 30)) {
      const f = flake; flake = null;
      void give('snow', f.x, f.y - 30, `눈송이 ${f.kind + 1}번 · 서리 기력 +3`, frost?.id, f.kind);
    } else if (flake.t > 22) flake = null;
  }

  // 11 섬광과 천둥
  const storm = first(11);
  if (storm && !flash && now > nextFlash) { nextFlash = now + rnd(15, 30) * MIN; flash = { x: rnd(W * 0.15, W * 0.85), t: 0, delay: Math.round(rnd(1, 5)), caught: false }; }
  if (flash) {
    flash.t += dt;
    if (!flash.caught && has && flash.t < flash.delay && Math.abs(m.x - flash.x) < 45 && m.y > gy - 90) {
      flash.caught = true;
      void give('flash', flash.x, gy - 60, `섬광 포착 (천둥까지 ${flash.delay}초)`, storm?.id, flash.delay);
    }
    if (flash.t >= flash.delay + 0.6) { if (!flash.caught) popText('콰르릉…', flash.x, gy - 50, '#c9c2d6'); flash = null; }
  }
}

// ---------------------------------------------------------------- 그리기

/** layer 'ground': 드래곤 뒤(바닥 물체), 'top': 드래곤 앞(글자·하늘 물체) */
export function drawLife(g: CanvasRenderingContext2D, layer: 'ground' | 'top' = 'ground') {
  if (!host) return;
  if (layer === 'top') { drawTop(g); return; }
  const W = host.W(), H = host.H(), gy = host.ground(), now = performance.now();
  g.save();
  if (host.enabled()) {
    // 2 물때: 블루가 있으면 하단 띠에 물
    if (first(2)) {
      const lv = tideLevel();
      const hgt = 3 + lv * 12;
      const grd = g.createLinearGradient(0, gy - hgt, 0, gy + 2);
      grd.addColorStop(0, 'rgba(110,180,255,0)');
      grd.addColorStop(1, 'rgba(90,160,240,0.35)');
      g.fillStyle = grd;
      g.fillRect(0, gy - hgt, W, hgt + 2);
      for (const s of shells) if (!s.got) {
        const x = s.fx * W;
        g.fillStyle = '#f3d9c4'; g.beginPath(); g.ellipse(x, gy - 5, 8, 5, 0, Math.PI, 0); g.fill();
        g.strokeStyle = '#b98f7a'; g.lineWidth = 1;
        for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x, gy - 5); g.lineTo(x + i * 3.5, gy - 9.5); g.stroke(); }
      }
    }
    // 0 잿불: 둥지 쪽 첫 흑염룡 발밑
    const black = first(0);
    if (ember && !ember.done && black) {
      const a = 0.4 + 0.3 * Math.sin(now / 400);
      g.fillStyle = ember.level === 3 ? `rgba(180,170,170,${a})` : `rgba(255,${ember.level === 1 ? 170 : 110},60,${a})`;
      g.beginPath(); g.ellipse(black.x, gy - 3, 22, 5, 0, 0, Math.PI * 2); g.fill();
    }
    // 1 구들돌
    if (stone) {
      const x = stone.fx * W, w = warmth(stone);
      g.fillStyle = '#5c5552'; g.beginPath(); g.ellipse(x, gy - 7, 18, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(255,${90 + 80 * (1 - w)},40,${0.15 + w * 0.6})`;
      g.beginPath(); g.ellipse(x, gy - 8, 14, 5, 0, 0, Math.PI * 2); g.fill();
      if (w > 0.4) { g.strokeStyle = `rgba(255,200,160,${w * 0.5})`; g.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * 6, gy - 16); g.quadraticCurveTo(x + i * 6 + 4, gy - 24 - Math.sin(now / 300 + i) * 3, x + i * 6, gy - 32); g.stroke(); } }
    }
    // 3 꽃시계: 아직 안 쓰다듬은 구간이면 꽃 위에 반짝임
    const em = first(3);
    if (em) {
      const img = host.img(`sk-03-${String(7 + segment()).padStart(2, '0')}`);
      const fx = em.x + em.w * 0.6;
      if (img && img.complete && img.naturalWidth) { const w = 34, h = w * img.naturalHeight / img.naturalWidth; g.drawImage(img, fx - w / 2, gy - h, w, h); }
      if (store.get('flower', '') !== segKey()) { g.fillStyle = `rgba(255,240,170,${0.5 + 0.4 * Math.sin(now / 350)})`; g.font = '12px sans-serif'; g.fillText('✦', fx + 10, gy - 34); }
    }
    // 5 반짝임
    for (const s of sparkles) { g.fillStyle = `rgba(255,120,150,${0.6 + 0.4 * Math.sin(now / 200 + s.x)})`; g.font = '14px sans-serif'; g.fillText('✦', s.x - 5, s.y); }
    // 7 간헐천: 남은 시간 표시(커서가 화산 근처일 때), 분출
    const vol = first(7);
    if (vol) {
      const gx = vol.x + 120;
      g.fillStyle = '#6d4a3a'; g.beginPath(); g.ellipse(gx, gy - 3, 12, 4, 0, 0, Math.PI * 2); g.fill();
      const m = host.mouse();
      if (geyser.burst < 0 && m.x >= 0 && Math.abs(m.x - gx) < 160 && m.y > gy - 260) {
        const left = Math.max(0, Math.ceil((geyser.next - now) / 1000));
        label(g, `간헐천 ${Math.floor(left / 60)}분 ${left % 60}초`, gx, gy - 20);
      }
      if (geyser.burst >= 0) {
        const hgt = Math.min(1, geyser.burst * 3) * 150;
        const grd = g.createLinearGradient(0, gy - hgt, 0, gy);
        grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(235,240,255,0.75)');
        g.fillStyle = grd; g.beginPath(); g.moveTo(gx - 8, gy); g.quadraticCurveTo(gx - 26, gy - hgt * 0.6, gx, gy - hgt); g.quadraticCurveTo(gx + 26, gy - hgt * 0.6, gx + 8, gy); g.fill();
      }
    }
    // 9 사금 접시
    if (pan) {
      const px = Math.max(40, Math.min(W - 40, pan.x));
      g.fillStyle = '#7a6040'; g.beginPath(); g.ellipse(px, gy - 5, 20, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8c45a'; for (let i = 0; i < pan.swings; i++) g.fillRect(px - 14 + (i % 5) * 7, gy - 8 - Math.floor(i / 5) * 3, 2, 2);
      if (pan.swings > 0) label(g, `사금 ${pan.swings}/10`, px, gy - 20);
    }
  }
  g.restore();
}

function drawTop(g: CanvasRenderingContext2D) {
  const W = host.W(), H = host.H(), gy = host.ground(), now = performance.now();
  void W;
  g.save();
  if (host.enabled()) {
    // 4 귀환 등대 빛줄기
    if (beacon) {
      const bx = beacon.side < 0 ? 0 : W - 36;
      const a = Math.min(1, beacon.t * 2) * Math.min(1, (8 - beacon.t) * 1.5);
      const grd = g.createLinearGradient(bx, 0, bx + 36, 0);
      const c = `rgba(220,235,255,${0.45 * a})`;
      if (beacon.side < 0) { grd.addColorStop(0, c); grd.addColorStop(1, 'rgba(220,235,255,0)'); } else { grd.addColorStop(0, 'rgba(220,235,255,0)'); grd.addColorStop(1, c); }
      g.fillStyle = grd; g.fillRect(bx, H * 0.15, 36, gy - H * 0.15);
    }
    // 6 8자 춤: 호박 위에 기울어진 8자
    if (dance) {
      const d = host.dragons().find((x) => x.id === dance!.id) ?? first(6);
      if (d) {
        g.save();
        g.translate(d.x, d.y - d.h - 30);
        g.rotate(dance.side * 0.5);
        g.strokeStyle = `rgba(255,190,80,${dance.t < 4 ? 0.9 : 0.5})`; g.lineWidth = 3;
        g.beginPath();
        for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; const x = Math.sin(a) * 18, y = Math.sin(a * 2) * 9; i ? g.lineTo(y, x) : g.moveTo(y, x); }
        g.stroke();
        const k = (now / 500) % (Math.PI * 2);
        g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(Math.sin(k * 2) * 9, Math.sin(k) * 18, 4, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
    // 8 바늘자리
    if (suture) {
      g.strokeStyle = 'rgba(190,170,255,0.7)'; g.lineWidth = 1.5;
      g.beginPath(); suture.dots.slice(0, suture.i + 1).forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      suture.dots.forEach((p, i) => {
        g.fillStyle = i < suture!.i ? '#d6c8ff' : i === suture!.i ? `rgba(240,230,255,${0.6 + 0.4 * Math.sin(now / 150)})` : 'rgba(200,190,240,0.55)';
        g.beginPath(); g.arc(p.x, p.y, i === suture!.i ? 7 : 5, 0, Math.PI * 2); g.fill();
      });
      label(g, `정밀 봉합 · ${Math.max(0, Math.ceil(8 - suture.t))}초`, suture.dots[0].x, suture.dots[0].y - 22);
    }
    // 10 큰 눈송이
    if (flake) {
      g.save(); g.translate(flake.x, flake.y); g.rotate(flake.t * 0.5);
      g.strokeStyle = 'rgba(235,245,255,0.95)'; g.lineWidth = 2;
      const arms = 6, len = 14 + (flake.kind % 4) * 2;
      for (let i = 0; i < arms; i++) {
        g.rotate(Math.PI / 3);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len); g.stroke();
        const b = 4 + (flake.kind % 3) * 2;
        g.beginPath(); g.moveTo(0, -len * 0.55); g.lineTo(-b, -len * 0.55 - b); g.moveTo(0, -len * 0.55); g.lineTo(b, -len * 0.55 - b); g.stroke();
      }
      g.restore();
    }
    // 11 섬광 (하단 띠 안에서만 작게)
    if (flash && flash.t < 0.35) {
      g.fillStyle = `rgba(230,240,255,${0.8 * (1 - flash.t / 0.35)})`;
      g.beginPath(); g.moveTo(flash.x - 4, gy - 80); g.lineTo(flash.x + 6, gy - 45); g.lineTo(flash.x - 2, gy - 45); g.lineTo(flash.x + 4, gy); g.lineTo(flash.x - 8, gy - 40); g.lineTo(flash.x, gy - 40); g.closePath(); g.fill();
    }
  }
  for (const p of pop) {
    g.globalAlpha = Math.max(0, 1 - p.t / 2.2);
    label(g, p.text, p.x, p.y - p.t * 20, p.color);
  }
  g.restore();
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#f0e4ff') {
  g.font = '600 12px "Malgun Gothic", sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 3; g.strokeStyle = '#120f1a';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}
