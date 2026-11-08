// 고정 데이터와 시간 상수. 웹 버전(흑염룡의 레어 로컬 웹게임) 값을 기준으로 한다.

/** 시간 배율. 웹 버전보다 몇 배 느리게 진행할지. 기간은 곱하고, 초당 회복량은 나눈다. */
export const TIME_SCALE = 3;

export const T = {
  /** 게임 1일 (실제 초) */
  DAY: 1200 * TIME_SCALE,
  /** 편도 이동 시간: 사냥, 지원, 귀환, 이주, 보복 */
  TRAVEL: 180 * TIME_SCALE,
  /** 성체가 되는 활동 시간 (+ Lv.3) */
  ADULT_AGE: 900 * TIME_SCALE,
  /** 알 부화 시간 */
  HATCH: 420 * TIME_SCALE,
  /** 산란 간격 */
  LAY: 1800 * TIME_SCALE,
  /** 세계 이벤트 간격 = EVENT_MIN + 0~EVENT_RAND */
  EVENT_MIN: 240 * TIME_SCALE,
  EVENT_RAND: 180 * TIME_SCALE,
  FIRST_EVENT: 150 * TIME_SCALE,
  TALK_FIRST: 210 * TIME_SCALE,
  TALK: 240 * TIME_SCALE,
  /** 인간 새 정착지 간격 */
  TOWN: 1800 * TIME_SCALE,
  /** 인간 정찰대 한 바퀴 */
  PATROL: 480 * TIME_SCALE,
  /** 초토화 후 재건 기간 */
  RUIN: 900 * TIME_SCALE,
  /** 시작 시 첫 흑염룡 나이 / 다른 종 성체 나이 */
  START_AGE_BLACK: 1800 * TIME_SCALE,
  START_AGE_OTHER: 2400 * TIME_SCALE,
  /** 지원 요청 응답 대기 (실제 초, 배율 없음) */
  SUPPORT_TIMEOUT: 300,
  /** 인간 방문 (테스트판): 첫 방문, 간격 = HUMAN_MIN + 0~HUMAN_RAND */
  HUMAN_FIRST: 300 * TIME_SCALE,
  HUMAN_MIN: 360 * TIME_SCALE,
  HUMAN_RAND: 360 * TIME_SCALE,
} as const;

export const RATE = {
  HP: 0.4 / TIME_SCALE,
  ENERGY: 0.12 / TIME_SCALE,
  INJURY: 1 / (240 * TIME_SCALE),
  XP: 0.09 / TIME_SCALE,
  ARMY: 0.08 / TIME_SCALE,
  ARMY_RUINED: 0.015 / TIME_SCALE,
} as const;

/** 따라잡기 상한 (초) */
export const CATCHUP_MAX = 8 * 3600;
/** 요약 창을 띄우는 최소 따라잡기 시간 (초) */
export const SUMMARY_MIN = 10 * 60;

export const SPECIES = [
  '흑염룡', '레드', '블루', '에메랄드', '백은', '루비',
  '호박', '화산', '흑요석', '황금', '서리', '폭풍',
] as const;

export const SPECIES_COLOR = [
  '#ce93ff', '#ee7765', '#70c9ef', '#86d6a0', '#d7e4f3', '#ef829e',
  '#e4b56e', '#ec9954', '#aa9fc2', '#f4d077', '#99e2ec', '#9eaeff',
];

export const GRADES = ['왜소', '보통', '정예', '군주', '패왕'] as const;
export const GRADE_COLOR = ['#a8a8b7', '#ddd5eb', '#76d6c8', '#ffc96b', '#f58cff'];
export const GRADE_MULT = [0.65, 1, 1.6, 3, 16];

export interface Region {
  name: string;
  x: number; // 지도 % 좌표
  y: number;
  risk: number;
  terrain: string;
  monsters: string[];
}

export const REGIONS: Region[] = [
  { name: '이끼숲', x: 16, y: 62, risk: 1, terrain: '울창한 숲 · 생명초', monsters: ['슬라임', '고블린', '늑대', '트렌트'] },
  { name: '서리 왕관', x: 24, y: 22, risk: 3, terrain: '빙하 · 서리 결정', monsters: ['설인', '서리 정령', '얼음 골렘'] },
  { name: '잊힌 왕도', x: 45, y: 65, risk: 2, terrain: '폐허 · 고대 유물', monsters: ['스켈레톤', '오크', '오우거', '리치'] },
  { name: '거울 호수', x: 59, y: 32, risk: 2, terrain: '수역 · 마력 진주', monsters: ['리자드맨', '히드라', '수룡'] },
  { name: '붉은 심장', x: 85, y: 24, risk: 4, terrain: '화산 · 흑철', monsters: ['화염 정령', '바실리스크', '용암 거인'] },
  { name: '황혼의 심연', x: 81, y: 74, risk: 5, terrain: '심연 · 영혼석', monsters: ['망령', '데스 나이트', '키메라', '심연 군주'] },
];

/** 레어 12곳의 지도 % 좌표 (종족 인덱스 순서) */
export const LAIR_POS: [number, number][] = [
  [85, 82], [88, 17], [62, 36], [15, 48], [20, 17], [78, 26],
  [35, 78], [94, 40], [72, 85], [46, 47], [10, 27], [48, 16],
];

/** 인간 마을 지도 % 좌표 (생성 순서) */
export const TOWN_POS: [number, number][] = [
  [12, 80], [55, 55], [60, 84], [38, 59], [45, 83], [68, 46], [29, 65], [72, 65],
];

export const START_TOWNS = [
  { name: '아르덴 왕도', army: 1200 },
  { name: '벨하임 요새', army: 800 },
  { name: '로웬 항구', army: 600 },
];

export const NEW_TOWNS = ['회색 성채', '새벽 변경', '솔바람 항구', '왕관 요새', '북부 전초'];

export const ROLES = ['용사', '창기사', '궁수', '마법사', '치유사', '암살자'] as const;
