// 전체화면 앱 감지 (Windows 전용). 실패하면 감지를 끄고 계속 진행한다.
import { screen, type Rectangle } from 'electron';

type Detector = () => Rectangle | null;

let detector: Detector | null | undefined;
export let detectorError: string | null = null;

function build(): Detector | null {
  if (process.platform !== 'win32') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const RECT = koffi.struct('BF_RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
  const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()');
  const GetWindowRect = user32.func('bool __stdcall GetWindowRect(void *hWnd, _Out_ BF_RECT *rect)');
  const GetClassNameW = user32.func('int __stdcall GetClassNameW(void *hWnd, _Out_ uint16_t *buf, int max)');
  const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *pid)');
  const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(void *hWnd)');
  void RECT;
  const SHELL = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'NotifyIconOverflowWindow', 'Windows.UI.Core.CoreWindow']);
  return () => {
    const h = GetForegroundWindow();
    if (!h || !IsWindowVisible(h)) return null;
    const pid = [0];
    GetWindowThreadProcessId(h, pid);
    if (pid[0] === process.pid) return null;
    const buf = new Uint16Array(128);
    const n = GetClassNameW(h, buf, 128);
    const cls = String.fromCharCode(...buf.slice(0, Math.max(0, n)));
    if (SHELL.has(cls)) return null;
    const r = { left: 0, top: 0, right: 0, bottom: 0 };
    if (!GetWindowRect(h, r)) return null;
    // 물리 픽셀 → DIP
    return screen.screenToDipRect(null, { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top });
  };
}

/** 주어진 화면 영역을 다른 프로그램의 창이 완전히 덮고 있으면 true */
export function isFullscreenOn(bounds: Rectangle): boolean {
  if (detector === undefined) {
    try {
      detector = build();
    } catch (e) {
      detector = null;
      detectorError = (e as Error).message;
    }
  }
  if (!detector) return false;
  try {
    const r = detector();
    if (!r) return false;
    return r.x <= bounds.x + 1 && r.y <= bounds.y + 1 && r.x + r.width >= bounds.x + bounds.width - 1 && r.y + r.height >= bounds.y + bounds.height - 1;
  } catch (e) {
    detectorError = (e as Error).message;
    detector = null;
    return false;
  }
}
