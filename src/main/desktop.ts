// 바탕화면 오버레이: 투명·항상 위·클릭 통과 창 하나에 드래곤, 둥지, 몬스터, 이펙트를 그린다.
import { BrowserWindow, ipcMain, screen, powerMonitor, nativeImage, type Display } from 'electron';
import path from 'node:path';
import type { State } from '../engine/engine';
import { isAdult, titleOf, DEFEND_MAX } from '../engine/engine';
import type { Settings, DesktopModel, HumanEvent } from '../shared/types';
import { isFullscreenOn } from './fullscreen';

interface Host {
  state: () => State;
  act: (a: { type: 'pet'; id: string } | { type: 'bounty' } | { type: 'defend' }) => string | null;
  test: boolean;
  settings: () => Settings;
  saveSettings: (patch: Partial<Settings>) => void;
  openManager: () => void;
  onFullscreenChange: (hidden: boolean) => void;
}

let win: BrowserWindow | null = null;
let host: Host;
let fullscreenHidden = false;
let ignoring = true;

function display(): Display {
  const all = screen.getAllDisplays();
  return all[host.settings().monitor] ?? screen.getPrimaryDisplay();
}

export function model(): DesktopModel {
  const s = host.state();
  const st = host.settings();
  const dragons = s.started
    ? s.dragons
        .filter((d) => !d.dead && (st.desktop[d.id] ?? d.home === 0))
        .map((d) => ({
          id: d.id, name: d.name, species: d.species, grade: d.grade, adult: isAdult(d), home: d.home, level: d.level, title: titleOf(d), fighting: s.battle?.dragon === d.id,
          // 내 레어 드래곤이 임무 중이거나 레어 밖에서 싸우는 중이면 바탕화면을 떠난다
          away: d.home === 0 && (!!d.mission || (s.battle?.dragon === d.id && s.battle.kind !== 'raid' && s.battle.kind !== 'duel')),
          fresh: s.time - d.born < 90 && d.age < 90,
          hurt: d.injury > 4 || d.hp < d.max * 0.35,
          last: d.last ? { foe: d.last.place.split(' · ').pop() || d.last.place, won: d.last.won } : undefined,
        }))
    : [];
  return {
    dragons,
    eggs: s.eggs.slice(0, 3).map((e) => ({ species: e.species, left: e.left })),
    perf: st.perf,
    nest: st.nest ?? null,
    season: st.season !== false,
    decor: s.decor ?? [],
    relations: s.relations,
    chatter: st.chatter ?? 'normal',
    raid: host.test && s.battle?.kind === 'raid' ? { defended: s.battle.defended ?? 0, max: DEFEND_MAX } : null,
  };
}

function shouldShow() {
  return !host.settings().hiddenAll && !fullscreenHidden;
}

function place() {
  if (!win) return;
  const wa = display().workArea;
  win.setBounds(wa);
}

function create() {
  const wa = display().workArea;
  win = new BrowserWindow({
    ...wa,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    title: '흑염룡 바탕화면',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setIgnoreMouseEvents(true, { forward: true });
  ignoring = true;
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { hash: 'desktop' });
  win.once('ready-to-show', () => sync());
  win.on('closed', () => { win = null; });
  // 그리기 프로세스가 죽으면 다시 띄운다
  win.webContents.on('render-process-gone', () => { log('overlay renderer gone → recreate'); recreate(); });
  win.webContents.on('unresponsive', () => { log('overlay unresponsive → reload'); win?.webContents.reload(); });
  lastAlive = Date.now();
}

function recreate() {
  try { if (win && !win.isDestroyed()) win.destroy(); } catch { /* 이미 닫힘 */ }
  win = null;
  create();
}

/** 창 상태를 다시 맞춘다: 위치·크기, 항상 위, 클릭 통과, 캡처 제외, 그릴 대상, 클릭 영역 */
export function recover(reason: string) {
  if (!win || win.isDestroyed()) { log('recover(' + reason + '): window missing → create'); create(); return; }
  sync();
  if (!win.isVisible()) return;
  win.setAlwaysOnTop(true, 'floating');
  win.setIgnoreMouseEvents(ignoring, { forward: true });
  win.webContents.send('desk:model', model());
  win.webContents.send('desk:recheck');
}

/** 수동 새로 고침: 오버레이를 완전히 다시 띄운다 */
export function hardReset() {
  log('manual hard reset');
  recreate();
}

let lastAlive = Date.now();
let driftCount = 0;
let logFn: (msg: string) => void = () => {};
function log(msg: string) { logFn(msg); }

/** 설정·화면 변화에 맞춰 보이기/숨기기, 위치를 맞춘다 */
export function sync() {
  if (!win || win.isDestroyed()) return;
  place();
  win.setContentProtection(host.settings().hideFromCapture !== false);
  if (shouldShow()) {
    if (!win.isVisible()) win.showInactive();
    win.webContents.send('desk:visible', true);
  } else if (win.isVisible()) {
    win.webContents.send('desk:visible', false);
    win.hide();
  }
}

export function sendHuman(h: HumanEvent) {
  if (win && !win.isDestroyed() && win.isVisible()) win.webContents.send('desk:human', h);
}

export function sendNotice(dragon: string | undefined, text: string) {
  if (win && !win.isDestroyed() && dragon) win.webContents.send('desk:notice', { dragon, text });
}

interface Rect { x: number; y: number; w: number; h: number }
let regions: Rect[] = [];
let lastCursor = { x: -1, y: -1 };

function setIgnore(ignore: boolean) {
  if (!win || ignore === ignoring) return;
  ignoring = ignore;
  win.setIgnoreMouseEvents(ignore, { forward: true });
}

function pollCursor() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const x = p.x - b.x, y = p.y - b.y;
  const inside = x >= 0 && y >= 0 && x < b.width && y < b.height;
  const hit = inside && regions.some((r) => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2);
  setIgnore(!hit);
  if (x !== lastCursor.x || y !== lastCursor.y) {
    lastCursor = { x, y };
    win.webContents.send('desk:cursor', inside ? { x, y } : { x: -1, y: -1 });
  }
}

/** 바탕화면 드래곤 사진: 오버레이 화면을 그대로 찍어 PNG로 돌려준다 (투명 배경 대신 밤하늘 배경을 깐다) */
export async function snapshot(): Promise<Buffer | null> {
  if (!win || win.isDestroyed() || !win.isVisible()) return null;
  const img = await win.webContents.capturePage();
  if (img.isEmpty()) return null;
  const size = img.getSize();
  const bmp = img.toBitmap(); // BGRA
  // 아래쪽 절반만 남기고(드래곤들이 주로 있는 곳) 밤하늘 그라데이션 위에 합성
  const top = Math.floor(size.height * 0.45), h = size.height - top, w = size.width;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const k = y / h;
    const br = 20 + 30 * k, bg = 16 + 18 * k, bb = 40 + 30 * k; // 밤하늘
    for (let x = 0; x < w; x++) {
      const si = ((y + top) * w + x) * 4, di = (y * w + x) * 4;
      const a = bmp[si + 3] / 255;
      out[di] = Math.min(255, Math.round(bmp[si] + bb * (1 - a))); // 미리 곱해진 알파
      out[di + 1] = Math.min(255, Math.round(bmp[si + 1] + bg * (1 - a))); // 미리 곱해진 알파
      out[di + 2] = Math.min(255, Math.round(bmp[si + 2] + br * (1 - a))); // 미리 곱해진 알파
      out[di + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(out, { width: w, height: h }).toPNG();
}

export function isHiddenByFullscreen() {
  return fullscreenHidden;
}

export function startDesktop(h: Host & { log?: (msg: string) => void }) {
  host = h;
  if (h.log) logFn = h.log;
  ipcMain.on('desk:alive', () => { lastAlive = Date.now(); });
  ipcMain.handle('desk:init', () => model());
  ipcMain.handle('desk:pet', (_e, id: string) => host.act({ type: 'pet', id: String(id) }));
  ipcMain.handle('desk:bounty', () => host.act({ type: 'bounty' }));
  ipcMain.handle('desk:defend', () => (host.test ? host.act({ type: 'defend' }) : '테스트판 기능입니다'));
  // 오버레이가 알려 주는 "클릭을 받아야 하는 영역" (창 좌표, DIP)
  ipcMain.on('desk:regions', (_e, r: Rect[]) => { regions = Array.isArray(r) ? r : []; });
  ipcMain.on('desk:open-manager', () => host.openManager());
  ipcMain.on('desk:nest', (_e, p: { x: number; y: number }) => host.saveSettings({ nest: p }));
  create();
  screen.on('display-metrics-changed', place);
  screen.on('display-added', sync);
  screen.on('display-removed', sync);
  // 1초마다 그릴 대상 갱신
  setInterval(() => {
    if (win && !win.isDestroyed() && win.isVisible()) win.webContents.send('desk:model', model());
  }, 1000);
  // 커서 위치를 메인 프로세스가 직접 읽어 클릭 통과 여부를 정한다.
  // (Windows가 넘겨주는 마우스 이동은 캡처 도구 같은 전체 화면 창이 지나간 뒤 끊길 수 있다)
  setInterval(pollCursor, 40);
  // 주기 점검 (2초): 창이 사라졌거나, 그리기가 멈췄거나, 위치가 어긋났으면 복구하고
  // 항상 위·클릭 통과·캡처 제외를 다시 건다 (다른 항상-위 창이 끼어든 뒤에도 회복되도록)
  setInterval(() => {
    if (!win || win.isDestroyed()) { log('watchdog: window missing → create'); create(); return; }
    if (!shouldShow()) return;
    if (!win.isVisible()) { log('watchdog: should be visible → show'); sync(); }
    if (Date.now() - lastAlive > 6000) {
      log('watchdog: no heartbeat → reload');
      lastAlive = Date.now();
      win.webContents.reload();
      return;
    }
    const wa = display().workArea, b = win.getBounds();
    const drift = Math.max(Math.abs(b.x - wa.x), Math.abs(b.y - wa.y), Math.abs(b.width - wa.width), Math.abs(b.height - wa.height));
    if (drift > 4) {
      driftCount++;
      if (driftCount <= 3) { log(`watchdog: bounds drift ${drift}px → place`); place(); }
    } else driftCount = 0;
    win.setAlwaysOnTop(true, 'floating');
    win.setIgnoreMouseEvents(ignoring, { forward: true });
    win.setContentProtection(host.settings().hideFromCapture !== false);
  }, 2000);
  // 잠금 해제·절전 복귀·화면 구성 변경 뒤에는 바로 다시 맞춘다
  powerMonitor.on('unlock-screen', () => setTimeout(() => recover('unlock'), 800));
  powerMonitor.on('resume', () => setTimeout(() => recover('resume'), 1500));
  screen.on('display-metrics-changed', () => setTimeout(() => recover('display'), 500));
  // 2초마다 전체화면 앱 검사
  setInterval(() => {
    const on = host.settings().autoHide && isFullscreenOn(display().bounds);
    if (on !== fullscreenHidden) {
      fullscreenHidden = on;
      sync();
      host.onFullscreenChange(on);
    }
  }, 2000);
}
