import type { State, Summary, Action, Notice } from '../engine/engine';

export type NotifyKey = 'raid' | 'hatch' | 'return' | 'death' | 'visit' | 'support' | 'over' | 'human';

export const NOTIFY_LABEL: Record<NotifyKey, string> = {
  raid: '레어 습격',
  hatch: '부화',
  return: '사냥 귀환',
  death: '사망',
  visit: '방문 이벤트',
  support: '지원 요청',
  over: '혈통 종료',
  human: '인간 방문',
};

export interface Settings {
  perf: 'high' | 'low';
  notify: Record<NotifyKey, boolean>;
  autoHide: boolean;
  autoStart: boolean;
  monitor: number;
  /** 드래곤 id → 바탕화면 표시 여부. 없으면 기본값(내 레어 드래곤만 표시) */
  desktop: Record<string, boolean>;
  hiddenAll: boolean;
  /** 스크린샷·화면 녹화에서 바탕화면 요소를 뺀다 (Windows 10 2004 이상) */
  hideFromCapture: boolean;
  /** 계절 연출 (눈·낙엽·꽃잎·반딧불) */
  season?: boolean;
  /** 바탕화면 말풍선 양 (드래곤끼리 수다·장난 대사 등) */
  chatter?: 'many' | 'normal' | 'few';
  nest?: { x: number; y: number };
}

export const DEFAULT_SETTINGS: Settings = {
  perf: 'high',
  notify: { raid: true, hatch: true, return: true, death: true, visit: true, support: true, over: true, human: false },
  autoHide: true,
  autoStart: false,
  monitor: 0,
  desktop: {},
  hiddenAll: false,
  hideFromCapture: true,
};

export interface Snapshot {
  state: State;
  paused: boolean;
  savedAt: number | null;
  saveError: string | null;
}

export interface InitData extends Snapshot {
  settings: Settings;
  summary: Summary | null;
  savePath: string;
  monitors: { id: number; label: string }[];
  archives: { file: string; title: string }[];
  edition?: 'stable' | 'test';
}

export interface DesktopDragon {
  id: string; name: string; species: number; grade: number; adult: boolean; home: number;
  /** 출격·이주 등으로 레어를 비움 → 바탕화면에서 날아 떠난다 */
  away?: boolean;
  /** 막 부화함 (바탕화면 둥지에서 부화 연출) */
  fresh?: boolean;
  /** 부상이 심함 → 느리게 걷고 자주 쉰다 */
  hurt?: boolean;
  level?: number;
  title?: string | null;
  /** 레어(또는 레어 앞)에서 싸우는 중 */
  fighting?: boolean;
  /** 마지막 전투 상대와 결과 (귀환 대사) */
  last?: { foe: string; won: boolean };
}

export interface DesktopModel {
  dragons: DesktopDragon[];
  eggs: { species: number; left: number }[];
  perf: 'high' | 'low';
  nest: { x: number; y: number } | null;
  season?: boolean;
  decor?: string[];
  /** 친밀도 [종족] (손님 대사·친한 종족 들르기) */
  relations?: number[];
  chatter?: 'many' | 'normal' | 'few';
  /** 레어 습격 진행 중 (바탕화면 방어전) */
  raid?: { defended: number; max: number } | null;
  /** 실험 규칙 '종족 고유 스킬' (스킬 모션·이펙트 연출) */
  skills?: boolean;
}


export interface DesktopApi {
  init(): Promise<DesktopModel>;
  setRegions(r: { x: number; y: number; w: number; h: number }[]): void;
  openManager(): void;
  saveNest(p: { x: number; y: number }): void;
  onModel(cb: (m: DesktopModel) => void): () => void;
  onNotice(cb: (n: { dragon: string; text: string }) => void): () => void;
  onVisible(cb: (v: boolean) => void): () => void;
  onCursor(cb: (p: { x: number; y: number }) => void): () => void;
  alive(): void;
  onRecheck(cb: () => void): () => void;
  onHuman(cb: (h: HumanEvent) => void): () => void;
  /** 조종 모드에서 드래곤 쓰다듬기. 실패 사유 또는 null */
  pet(id: string): Promise<string | null>;
  /** 바탕화면 몬스터를 기절시켰을 때 보상 요청 */
  bounty(): Promise<string | null>;
  /** 바탕화면 방어전: 침입자를 쫓아냈을 때 */
  defend(): Promise<string | null>;
}

/** 바탕화면 인간 연출 */
export interface HumanEvent { type: 'tribute' | 'bard' | 'challenger' | 'pilgrim' | 'raid' | 'flee' | 'ally' | 'refugee' | 'raid-won' | 'fall'; dragon?: string; text?: string; species?: number; why?: 'thanks' | 'egg' | 'drop-in'; rel?: number }

export interface Api {
  init(): Promise<InitData>;
  act(a: Action): Promise<string | null>;
  setPaused(p: boolean): Promise<void>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  exportSave(): Promise<string | null>;
  importSave(): Promise<string | null>;
  newChronicle(): Promise<void>;
  openBattle(): Promise<void>;
  quit(): Promise<void>;
  /** 테스트판: 본편 저장을 다시 복사해 처음부터 (지금 테스트 연대기는 보관) */
  reseed(): Promise<string | null>;
  /** 테스트판: 바탕화면 드래곤 사진 (사진\흑염룡 폴더) */
  photo(): Promise<string | null>;
  onSnapshot(cb: (s: Snapshot) => void): () => void;
  onSummary(cb: (s: Summary) => void): () => void;
  onFocus(cb: (target: string) => void): () => void;
  desktop: DesktopApi;
}

export type { State, Summary, Action, Notice };
