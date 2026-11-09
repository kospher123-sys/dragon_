import {
  app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain, dialog, screen, powerMonitor, protocol, net, globalShortcut, shell,
} from 'electron';
import { pathToFileURL } from 'node:url';
import { startDesktop, sync as syncDesktop, sendNotice, sendHuman, isHiddenByFullscreen, hardReset, snapshot as deskSnapshot } from './desktop';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  newState, step, catchUp, act, newCtx, importWeb, validate, log,
  type State, type Summary, type Notice, type Action,
} from '../engine/engine';
import { CATCHUP_MAX, SUMMARY_MIN } from '../engine/data';
import { DEFAULT_SETTINGS, type Settings, type Snapshot, type InitData, type NotifyKey } from '../shared/types';

// 1.5.0: 테스트판을 본편으로 합치고 테스트판 빌드를 없앴다. 예전 테스트판 저장(%APPDATA%\흑염룡-테스트)은 읽지 않는다.
const APP_NAME = '흑염룡';
/** 성장·자동 사냥·실험 규칙·고유 스킬 등 예전 테스트판 기능 (1.5.0부터 늘 켬) */
const FEATURES = true;

app.setName(APP_NAME);
app.setAppUserModelId('com.blackflame.desktop');

protocol.registerSchemesAsPrivileged([
  { scheme: 'bf', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// ------------------------------------------------------------------ 경로 (단일 실행 잠금보다 먼저)
if (process.env.BLACKFLAME_DATA) app.setPath('userData', process.env.BLACKFLAME_DATA);
else app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ------------------------------------------------------------------ 경로
const dir = app.getPath('userData');
const WORLD = path.join(dir, 'world.json');
const BACKUP = path.join(dir, 'world.backup.json');
const SETTINGS = path.join(dir, 'settings.json');
const ARCHIVE = path.join(dir, 'archives');
const RENDERER = path.join(__dirname, '..', 'renderer');
const IMG = path.join(RENDERER, 'img');
/** 교체용 그림 폴더: 같은 이름의 PNG를 넣으면 기본 그림 대신 쓴다 */
const IMG_OVERRIDE = path.join(dir, 'img');

// ------------------------------------------------------------------ 상태
let state: State;
let paused = false;
let settings: Settings = structuredClone(DEFAULT_SETTINGS);
let savedAt: number | null = null;
let saveError: string | null = null;
let pendingSummary: Summary | null = null;
let quitting = false;
let dirty = false;
let manager: BrowserWindow | null = null;
let battleWin: BrowserWindow | null = null;
let tray: Tray | null = null;

interface SaveFile {
  format: 'blackflame-desktop-save';
  savedAt: number; // epoch ms
  paused: boolean;
  state: State;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeAtomic(file: string, data: unknown) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
  // 백신·동기화 프로그램이 파일을 잠깐 잡고 있으면 이름 바꾸기가 실패할 수 있어 몇 번 다시 시도한다
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      if (i >= 4) {
        // 마지막 수단: 직접 덮어쓴다
        fs.copyFileSync(tmp, file);
        try { fs.unlinkSync(tmp); } catch { /* 남아도 다음 저장 때 덮어씀 */ }
        return;
      }
      const until = Date.now() + 40 * (i + 1);
      while (Date.now() < until) { /* 짧게 대기 */ }
    }
  }
}

function save() {
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(WORLD)) fs.copyFileSync(WORLD, BACKUP);
    const now = Date.now();
    const data: SaveFile = { format: 'blackflame-desktop-save', savedAt: now, paused, state };
    writeAtomic(WORLD, data);
    savedAt = now;
    saveError = null;
    dirty = false;
  } catch (e) {
    saveError = (e as Error).message;
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(dir, { recursive: true });
    writeAtomic(SETTINGS, settings);
  } catch { /* 설정 저장 실패는 게임 진행에 영향 없음 */ }
}

function loadSettings() {
  const s = readJson<Partial<Settings>>(SETTINGS);
  if (s) settings = { ...structuredClone(DEFAULT_SETTINGS), ...s, notify: { ...DEFAULT_SETTINGS.notify, ...(s.notify || {}) } };
}

function freshState(chronicle = 1) {
  return newState(crypto.randomBytes(4).readUInt32LE(0), chronicle);
}

/** 꺼져 있던 시간을 따라잡는다. 요약할 만큼 길면 요약을 남긴다. */
function applyGap(ms: number) {
  if (paused || !state.started || state.over) return;
  const seconds = Math.min(CATCHUP_MAX, Math.max(0, ms / 1000));
  if (seconds < 1) return;
  const sum = catchUp(state, seconds);
  dirty = true;
  if (seconds >= SUMMARY_MIN) {
    pendingSummary = sum;
    manager?.webContents.send('summary', sum);
  }
}

/** 1.5.0 본편 첫 실행: 예전 버전 저장을 한 번만 따로 남겨 둔다 (되돌리고 싶을 때 이 파일을 world.json으로) */
function keepPre15() {
  const keep = path.join(dir, 'world.before-1.5.0.json');
  try { if (fs.existsSync(WORLD) && !fs.existsSync(keep)) fs.copyFileSync(WORLD, keep); } catch { /* 복사 실패해도 진행 */ }
}

function loadWorld() {
  keepPre15();
  const file = readJson<SaveFile>(WORLD) ?? readJson<SaveFile>(BACKUP);
  if (file && file.format === 'blackflame-desktop-save') {
    try {
      validate(file.state);
      state = file.state;
      testRules();
      paused = !!file.paused;
      savedAt = file.savedAt;
      applyGap(Date.now() - file.savedAt);
      return;
    } catch (e) {
      saveError = `저장 파일을 읽지 못해 새로 시작했습니다. 기존 파일은 ${WORLD} 에 남아 있습니다. (${(e as Error).message})`;
      try { fs.copyFileSync(WORLD, WORLD + '.broken-' + Date.now()); } catch { /* 없음 */ }
    }
  }
  state = freshState();
  testRules();
}

/** 실험 규칙을 처음엔 모두 켠다 (설정 탭에서 끌 수 있음). 1.5.0부터 본편도 같다 */
function testRules() {
  if (FEATURES && !state.rules) state.rules = { defense: true, depletion: true, parallel: true, tactics: true, skills: true };
  else if (FEATURES && state.rules) {
    if (state.rules.tactics === undefined) state.rules.tactics = true;
    if (state.rules.skills === undefined) state.rules.skills = true; // 1.4.0 종족 고유 스킬
  }
}

// ------------------------------------------------------------------ 진행 루프
let last = Date.now();
function tick() {
  const now = Date.now();
  const gap = now - last;
  last = now;
  if (paused || !state.started || state.over) return;
  // 30초 넘게 끊겼으면(절전 등) 꺼져 있던 것으로 보고 따라잡기
  if (gap > 30_000) {
    applyGap(gap);
    return;
  }
  const ctx = newCtx(false);
  let left = Math.min(gap / 1000, 1);
  while (left > 0) {
    const dt = Math.min(0.5, left);
    step(state, dt, ctx);
    left -= dt;
  }
  dirty = true;
  handleNotices(ctx.notices);
}

const KIND_TO_KEY: Partial<Record<Notice['kind'], NotifyKey>> = {
  raid: 'raid', fall: 'raid', hatch: 'hatch', return: 'return', death: 'death', visit: 'visit', support: 'support', over: 'over', human: 'human',
};

const queued: Notice[] = [];

function flushQueued() {
  if (!queued.length) return;
  const list = queued.splice(0);
  const shown = list.slice(0, 3);
  for (const n of shown) showNotification(n);
  if (list.length > 3 && Notification.isSupported()) {
    new Notification({ title: '흑염룡', body: `숨겨져 있는 동안 소식 ${list.length - 3}건이 더 있었습니다. 역사 탭에서 확인하세요.`, icon: path.join(IMG, 'app-icon.png') }).show();
  }
}

function showNotification(n: Notice) {
  if (!Notification.isSupported()) return;
  const note = new Notification({
    title: n.kind === 'raid' ? '레어가 공격받고 있어!' : n.kind === 'support' ? '지원 요청' : '흑염룡',
    body: n.text,
    icon: path.join(IMG, 'app-icon.png'),
  });
  note.on('click', () => {
    if (n.kind === 'raid') openBattle();
    else openManager(n.kind === 'support' ? 'support' : n.dragon && n.kind !== 'over' ? 'dragon:' + n.dragon : undefined);
  });
  note.show();
}

function handleNotices(list: Notice[]) {
  for (const n of list) {
    if (n.ally) { sendHuman({ type: 'ally', species: n.ally.species, why: n.ally.why, rel: n.ally.rel }); continue; }
    if (n.scene) { sendHuman({ type: n.scene }); continue; }
    if (n.kind !== 'human') sendNotice(n.dragon, n.text);
    // 바탕화면 인간 연출: 방문 소식, 레어 습격(인간 원정대가 둥지로 몰려옴)
    if (n.kind === 'human' && n.human) sendHuman({ type: n.human, dragon: n.dragon, text: n.text });
    else if (n.kind === 'raid' && state.battle?.kind === 'raid') sendHuman({ type: 'raid', dragon: n.dragon });
    else if (n.kind === 'ruin') sendHuman({ type: 'refugee', text: n.text });
    // 습격 알림은 레어 방어전(raid)만: 사냥 중 교전은 'info'로 기록된다
    const key = KIND_TO_KEY[n.kind];
    if (!key) continue;
    if (['death', 'fall', 'over', 'raid', 'support', 'hatch'].includes(n.kind)) save();
    if (!settings.notify[key]) continue;
    if (isHiddenByFullscreen()) queued.push(n);
    else showNotification(n);
  }
}

function snapshot(): Snapshot {
  return { state, paused, savedAt, saveError };
}

function broadcast() {
  const snap = snapshot();
  for (const w of [manager, battleWin]) {
    if (w && !w.isDestroyed() && w.isVisible()) w.webContents.send('snapshot', snap);
  }
}

// ------------------------------------------------------------------ 창
function createManager() {
  manager = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    title: '흑염룡 둥지 관리',
    backgroundColor: '#14121c',
    icon: path.join(IMG, 'app-icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  manager.removeMenu();
  manager.loadFile(path.join(RENDERER, 'index.html'));
  manager.once('ready-to-show', () => manager?.show());
  manager.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      manager?.hide();
    }
  });
}

function openManager(focus?: string) {
  if (!manager || manager.isDestroyed()) createManager();
  manager!.show();
  if (manager!.isMinimized()) manager!.restore();
  manager!.focus();
  manager!.webContents.send('snapshot', snapshot());
  if (focus) manager!.webContents.send('focus', focus);
}

function openBattle() {
  if (battleWin && !battleWin.isDestroyed()) {
    battleWin.show();
    battleWin.focus();
    return;
  }
  battleWin = new BrowserWindow({
    width: 1060,
    height: 680,
    title: '전투',
    backgroundColor: '#14121c',
    icon: path.join(IMG, 'app-icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  battleWin.removeMenu();
  battleWin.loadFile(path.join(RENDERER, 'index.html'), { hash: 'battle' });
  battleWin.on('closed', () => { battleWin = null; });
}

function trayIcon() {
  return nativeImage.createFromPath(path.join(IMG, 'app-icon.png')).resize({ width: 32, height: 32 });
}

/** 트레이에 마우스를 올리면 보이는 한 줄 상태 */
function trayStatus() {
  if (!state?.started) return '흑염룡 · 시작 전';
  if (state.over) return '흑염룡 · 혈통 종료';
  const alive = state.dragons.filter((d) => !d.dead);
  const away = alive.filter((d) => d.mission).length;
  const parts = [`드래곤 ${alive.length}`, `알 ${state.eggs.length}`];
  if (away) parts.push(`출격 ${away}`);
  if (state.battle) parts.push('⚔ 레어 습격 중');
  if (state.prompt) parts.push('지원 요청 대기');
  return `흑염룡${paused ? ' · 일시정지' : ''}\n${parts.join(' · ')}`;
}

let lastTip = '';
function refreshTip() {
  if (!tray) return;
  const t = trayStatus();
  if (t !== lastTip) { lastTip = t; tray.setToolTip(t); }
}

function toggleHiddenAll() {
  settings.hiddenAll = !settings.hiddenAll;
  saveSettings();
  refreshTray();
  syncDesktop();
}

const HIDE_KEY = 'Control+Alt+D';
let hideKeyOk = false;

function refreshTray() {
  if (!tray) return;
  lastTip = '';
  refreshTip();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '관리 창 열기\tCtrl+Alt+M', click: () => openManager() },
    { label: (settings.hiddenAll ? '바탕화면 드래곤 보이기' : '바탕화면 드래곤 모두 숨기기') + (hideKeyOk ? '\tCtrl+Alt+D' : ''), click: () => toggleHiddenAll() },
    { label: '바탕화면 새로 고침', click: () => hardReset() },
    ...(FEATURES ? [{ label: '바탕화면 드래곤 사진 찍기', click: () => { void takePhoto(); } }] : []),
    ...(FEATURES ? [{
      label: state?.dragons.some((d) => !d.dead && d.home === 0 && d.auto !== undefined) ? '자동 사냥 모두 끄기' : '내 레어 모두 자동 사냥 (알아서)',
      click: () => {
        const on = !state.dragons.some((d) => !d.dead && d.home === 0 && d.auto !== undefined);
        for (const d of state.dragons) if (!d.dead && d.home === 0) act(state, { type: 'auto', id: d.id, region: on ? -1 : null });
        save(); broadcast(); refreshTray();
      },
    }] : []),
    { label: paused ? '진행 재개' : '일시정지', click: () => { setPaused(!paused); } },
    { type: 'separator' },
    { label: '저장하고 종료', click: () => quit() },
  ]));
}

/** 바탕화면 드래곤 사진을 '사진\흑염룡' 폴더에 저장하고 폴더를 연다 */
async function takePhoto(): Promise<string | null> {
  try {
    const png = await deskSnapshot();
    if (!png) return '바탕화면 드래곤이 보일 때 찍을 수 있어요.';
    const folder = path.join(app.getPath('pictures'), '흑염룡');
    fs.mkdirSync(folder, { recursive: true });
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const file = path.join(folder, `흑염룡-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`);
    fs.writeFileSync(file, png);
    setTimeout(() => { try { shell.showItemInFolder(file); } catch { /* 폴더 열기 실패 무시 */ } }, 50);
    return null;
  } catch (e) {
    return '사진을 저장하지 못했어요: ' + (e as Error).message;
  }
}

function setPaused(p: boolean) {
  paused = p;
  last = Date.now();
  save();
  refreshTray();
  broadcast();
}

function quit() {
  quitting = true;
  save();
  saveSettings();
  app.quit();
}

function archiveCurrent() {
  try {
    fs.mkdirSync(ARCHIVE, { recursive: true });
    const first = state.dragons[0];
    const file = path.join(ARCHIVE, `연대기-${state.chronicle}-${Date.now()}.json`);
    writeAtomic(file, { format: 'blackflame-desktop-save', savedAt: Date.now(), paused: false, state, title: `${state.chronicle}번째 연대기 · ${first?.name || '흑염룡'}` });
  } catch { /* 보관 실패는 무시하고 진행 */ }
}

function listArchives() {
  try {
    return fs.readdirSync(ARCHIVE).filter((f) => f.endsWith('.json')).sort().reverse().map((f) => {
      const j = readJson<{ title?: string }>(path.join(ARCHIVE, f));
      return { file: f, title: j?.title || f };
    });
  } catch {
    return [];
  }
}

function prepareOverrideFolder() {
  try {
    fs.mkdirSync(IMG_OVERRIDE, { recursive: true });
    const readme = path.join(IMG_OVERRIDE, '그림 교체 안내.txt');
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(readme, [
        '이 폴더에 기본 그림과 같은 이름의 PNG 파일을 넣으면 게임을 다시 켤 때 그 그림을 씁니다.',
        '파일 이름: sheet.png, flight.png, species.png, monsters.png, nest.png, fx.png, map.png, castle.png, village.png, party-motion.png',
        '칸 배치(가로×세로 칸 수)는 기본 그림과 같아야 합니다. 원래대로 돌리려면 파일을 지우세요.',
      ].join('\r\n'), 'utf8');
    }
  } catch { /* 안내 파일 실패는 무시 */ }
}

// ------------------------------------------------------------------ IPC
function registerIpc() {
  ipcMain.handle('init', (e): InitData => {
    const isManager = !!manager && e.sender === manager.webContents;
    const summary = isManager ? pendingSummary : null;
    if (isManager) pendingSummary = null;
    return {
      ...snapshot(),
      settings,
      summary,
      savePath: WORLD,
      monitors: screen.getAllDisplays().map((d, i) => ({ id: i, label: `${i + 1}번 모니터 (${d.size.width}×${d.size.height})${d.id === screen.getPrimaryDisplay().id ? ' · 주 모니터' : ''}` })),
      archives: listArchives(),
      edition: 'stable',
      features: FEATURES,
    };
  });
  ipcMain.handle('act', (_e, a: Action) => {
    const ctx = newCtx(false);
    const err = act(state, a, ctx);
    if (!err) {
      if (a.type === 'start') last = Date.now();
      if (a.type === 'auto') refreshTray();
      save();
      handleNotices(ctx.notices);
      broadcast();
    }
    return err;
  });
  ipcMain.handle('pause', (_e, p: boolean) => setPaused(p));
  ipcMain.handle('settings', (_e, patch: Partial<Settings>) => {
    settings = { ...settings, ...patch, notify: { ...settings.notify, ...(patch.notify || {}) } };
    if (patch.autoStart !== undefined && process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: settings.autoStart, path: process.execPath });
    }
    saveSettings();
    refreshTray();
    syncDesktop();
    return settings;
  });
  ipcMain.handle('export', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? manager!;
    const r = await dialog.showSaveDialog(win, {
      title: '저장 파일 내보내기',
      defaultPath: `흑염룡-연대기-${state.chronicle}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return null;
    writeAtomic(r.filePath, { format: 'blackflame-desktop-save', savedAt: Date.now(), paused, state });
    return r.filePath;
  });
  ipcMain.handle('import', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? manager!;
    const r = await dialog.showOpenDialog(win, {
      title: '저장 파일 불러오기 (새 버전 또는 웹 버전 JSON)',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    try {
      const st = fs.statSync(r.filePaths[0]);
      if (st.size > 20_000_000) throw new Error('20MB 이하 파일만 불러올 수 있습니다.');
      const raw = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
      let next: State;
      if (raw?.format === 'blackflame-desktop-save') {
        validate(raw.state);
        next = raw.state;
      } else {
        next = importWeb(raw, state.chronicle);
        validate(next);
      }
      archiveCurrent();
      state = next;
      testRules();
      last = Date.now();
      save();
      broadcast();
      return null;
    } catch (e) {
      return (e as Error).message || '불러오지 못했습니다.';
    }
  });
  ipcMain.handle('new-chronicle', () => {
    archiveCurrent();
    state = freshState(state.chronicle + 1);
    testRules();
    paused = false;
    save();
    broadcast();
  });
  ipcMain.handle('open-battle', () => openBattle());
  ipcMain.handle('quit', () => quit());
  ipcMain.handle('photo', () => takePhoto());
}

// ------------------------------------------------------------------ 시작
app.on('second-instance', () => openManager());
app.on('window-all-closed', () => { /* 트레이에 남는다 */ });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });

app.whenReady().then(() => {
  loadSettings();
  loadWorld();
  save();
  registerIpc();
  tray = new Tray(trayIcon());
  tray.on('double-click', () => openManager());
  tray.on('click', () => openManager());
  // 바탕화면 드래곤 숨기기/보이기 단축키 (다른 프로그램이 쓰고 있으면 조용히 건너뜀)
  try { hideKeyOk = globalShortcut.register(HIDE_KEY, () => toggleHiddenAll()); } catch { hideKeyOk = false; }
  try { globalShortcut.register('Control+Alt+M', () => openManager()); } catch { /* 사용 중이면 건너뜀 */ }
  refreshTray();
  protocol.handle('bf', (req) => {
    const u = new URL(req.url);
    const name = path.basename(decodeURIComponent(u.pathname));
    const custom = path.join(IMG_OVERRIDE, name);
    const file = u.host === 'img' && fs.existsSync(custom) ? custom : path.join(RENDERER, u.host, name);
    return net.fetch(pathToFileURL(file).toString());
  });
  prepareOverrideFolder();
  // 자동 실행이 켜져 있으면 지금 실행 중인 exe 경로로 다시 등록한다
  // (예전 버전 폴더에서 켜 둔 설정이 예전 exe를 계속 실행하는 문제 방지)
  if (settings.autoStart && process.platform === 'win32' && app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  }
  createManager();
  startDesktop({
    state: () => state,
    act: (a) => { const err = act(state, a, null); if (!err) { dirty = true; broadcast(); } return err; },
    test: FEATURES,
    settings: () => settings,
    saveSettings: (patch) => { settings = { ...settings, ...patch }; saveSettings(); },
    openManager: () => openManager(),
    onFullscreenChange: (hidden) => { if (!hidden) flushQueued(); },
    log: (msg) => {
      // 문제 추적용 기록 (최대 200KB, 넘으면 비움)
      try {
        const f = path.join(dir, 'desktop-log.txt');
        if (fs.existsSync(f) && fs.statSync(f).size > 200_000) fs.writeFileSync(f, '');
        fs.appendFileSync(f, `${new Date().toISOString()} ${msg}\n`);
      } catch { /* 기록 실패 무시 */ }
    },
  });
  last = Date.now();
  setInterval(tick, 200);
  setInterval(broadcast, 500);
  setInterval(refreshTip, 2000);
  setInterval(() => { if (dirty) save(); }, 30_000);
  powerMonitor.on('suspend', () => save());
  powerMonitor.on('resume', () => { /* tick이 간격을 보고 따라잡는다 */ });
});
