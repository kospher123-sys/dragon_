// 생활 스킬 12개의 보상 (v1.6.0). 바탕화면 상호작용은 src/renderer/desktop/life.ts, 여기는 엔진 쪽 보상·하루 한도.
// 기획 원본: Notion '흑염룡 드래곤 스킬 기획' 각 드래곤 페이지의 생활 스킬. 수치는 밸런스에 맞춰 줄였다(2026-11-09 결정 ①).
import type { State, Dragon } from './engine';

export type LifeKey =
  | 'ember' | 'stone' | 'shell' | 'flower' | 'beacon' | 'sparkle'
  | 'dance' | 'geyser' | 'suture' | 'gold' | 'snow' | 'flash';

/** 종족 번호 → 생활 스킬 키 */
export const LIFE_OF: LifeKey[] = ['ember', 'stone', 'shell', 'flower', 'beacon', 'sparkle', 'dance', 'geyser', 'suture', 'gold', 'snow', 'flash'];

/** 하루(게임 시간) 보상 횟수 한도 */
export const LIFE_CAP: Record<LifeKey, number> = {
  ember: 3, stone: 6, shell: 6, flower: 4, beacon: 4, sparkle: 14, dance: 3, geyser: 6, suture: 3, gold: 3, snow: 6, flash: 6,
};

/** 관리 창 설명 (생활 스킬 이름 → 실제 동작) */
export const LIFE_DESC: Record<string, string> = {
  '잿불 묻기': '앱이 꺼져 있던 실제 시간으로 둥지 불씨가 정해진다(1시간 미만 불씨 · 6시간 미만 잉걸 · 그 이상 재). 켠 뒤 첫 쓰다듬기에 레어 드래곤 모두 기력 +5/+10/+15. 하루 3번',
  '구들돌': '레드가 작업 표시줄에 데운 돌을 놓는다. 실제 6시간에 걸쳐 식고, 커서를 올리면 온기를 알려 준다. 절반 넘게 따뜻할 때 커서를 올리면 레드 기력 +4. 하루 6번',
  '물때': '실제 시각 조석 주기(12시간 25분)에 따라 화면 하단 물이 차고 빠진다. 간조 때 드러난 조개에 커서를 올리면 유물 +1. 하루 6번',
  '꽃시계': '실제 시각 네 구간(05·10·16·21시)마다 다른 꽃이 피어 있다. 구간마다 꽃에 커서를 올리면 에메랄드 기력 +3·경험치 +8. 하루 4번',
  '귀환 등대': '백은이 바탕화면으로 돌아오거나 가끔 화면 가장자리에 빛줄기를 세운다. 8초 안에 빛줄기에 커서를 올리면 백은 기력 +8. 하루 4번',
  '광채 분산': '루비를 기준으로 커서의 거울 대칭 자리에 반짝임 7개를 뿌린다(화면 밖이면 가장자리). 반짝임을 밟은 드래곤 기력 +2. 하루 14번',
  '8자 춤': '호박이 작업 표시줄 위에서 8자 춤을 춘다. 기울기로 화면 왼쪽·오른쪽 중 하나를 가리키니, 10초 안에 커서를 그쪽 가장자리로 옮기면 다음 사냥 승리 유물 +10%. 하루 3번',
  '간헐천 예보': '화산 옆 간헐천이 직전 증기 길이(초)×3분 뒤 다시 솟는다(남은 시간 표시). 솟는 순간 커서가 화산 근처에 있으면 레어 드래곤 기력 +4, 3번 연속이면 온천 날(기력 +10). 하루 6번',
  '정밀 봉합': '부상 드래곤이 있으면 바늘자리 점 6개가 뜬다. 8초 안에 커서로 순서대로 이으면 그 드래곤 부상 −25%, 다음 전투 첫 피격 −15%. 하루 3번',
  '사금 일기': '황금이 작업 표시줄 위에 있을 때 20분마다 사금 접시가 놓인다. 커서를 0.8~1.5초 리듬으로 좌우 10번 흔들면 사금 1알: 다음 사냥 승리 유물 +5%(최대 +25%). 너무 빠르면 쏟는다. 하루 3번',
  '눈송이 받기': '서리가 바탕화면에 있고 밤(18~06시)이거나 겨울 연출 중이면 20~40분마다 화면 하단에 큰 눈송이가 내린다. 커서로 받으면 24종 도감에 기록·서리 기력 +3. 하루 6번',
  '섬광과 천둥': '폭풍이 바탕화면에 있으면 15~30분마다 화면 하단에 섬광이 친다. 1~5초 뒤 천둥 전에 커서를 그 자리에 올리면 포착, 천둥이 빨리 올수록 폭풍 기력이 더 오른다(+2~+10). 하루 6번',
};

export interface LifeState {
  day: number;
  counts: Partial<Record<LifeKey, number>>;
  /** 다음 사냥 승리 유물 보너스 (8자 춤 +10%, 사금 +5%씩, 최대 +35%) */
  loot?: number;
  /** 정밀 봉합: 다음 전투 첫 피격 −15% 를 받을 드래곤 */
  guard?: string;
  /** 눈송이 도감 (24비트) */
  snow?: number;
  /** 간헐천 연속 성공 */
  geyser?: number;
}

const DAY = 24 * 3600;
const lair = (s: State) => s.dragons.filter((d) => !d.dead && d.home === 0 && !d.mission);
const energy = (d: Dragon, n: number) => { d.energy = Math.min(100, d.energy + n); };

/**
 * 생활 스킬 보상. 성공이면 null, 아니면 이유. 바탕화면에서 판정이 끝난 뒤에 부른다.
 * n: 키마다 다른 값 (ember 단계 1~3, snow 눈송이 종류 0~23, flash 천둥까지 초 1~5, geyser 는 무시)
 */
export function lifeReward(s: State, key: LifeKey, id?: string, n = 0): string | null {
  if (!LIFE_OF.includes(key)) return '알 수 없는 생활 스킬';
  const day = Math.floor(s.time / DAY);
  const L = (s.life ??= { day, counts: {} });
  if (L.day !== day) { L.day = day; L.counts = {}; }
  if ((L.counts[key] ?? 0) >= LIFE_CAP[key]) return '오늘 몫은 다 받았습니다';
  const sp = LIFE_OF.indexOf(key);
  const mine = lair(s).filter((d) => d.species === sp);
  const who = id ? s.dragons.find((d) => d.id === id && !d.dead) : mine[0];
  switch (key) {
    case 'ember': for (const d of lair(s)) energy(d, 5 * Math.max(1, Math.min(3, n))); break;
    case 'stone': if (!who) return '레드가 없습니다'; energy(who, 4); break;
    case 'shell': s.resources += 1; break;
    case 'flower': if (!who) return '에메랄드가 없습니다'; energy(who, 3); who.xp += 8; break;
    case 'beacon': if (!who) return '백은이 없습니다'; energy(who, 8); break;
    case 'sparkle': if (!who) return '드래곤이 없습니다'; energy(who, 2); break;
    case 'dance': L.loot = Math.min(0.35, (L.loot ?? 0) + 0.1); break;
    case 'geyser': {
      L.geyser = (L.geyser ?? 0) + 1;
      const spring = L.geyser >= 3;
      if (spring) L.geyser = 0;
      for (const d of lair(s)) energy(d, spring ? 10 : 4);
      break;
    }
    case 'suture': {
      const d = id ? s.dragons.find((x) => x.id === id && !x.dead && x.home === 0) : undefined;
      if (!d || d.injury <= 0) return '부상 드래곤이 없습니다';
      d.injury *= 0.75;
      L.guard = d.id;
      break;
    }
    case 'gold': L.loot = Math.min(0.35, (L.loot ?? 0) + 0.05); break;
    case 'snow': {
      if (!who) return '서리가 없습니다';
      energy(who, 3);
      L.snow = (L.snow ?? 0) | (1 << (Math.max(0, Math.min(23, Math.floor(n)))));
      break;
    }
    case 'flash': if (!who) return '폭풍이 없습니다'; energy(who, Math.max(2, Math.min(10, (6 - Math.max(1, Math.min(5, n))) * 2))); break;
  }
  L.counts[key] = (L.counts[key] ?? 0) + 1;
  return null;
}

/** 간헐천을 놓쳤을 때 연속 기록을 끊는다 */
export function lifeMiss(s: State, key: LifeKey) {
  if (key === 'geyser' && s.life) s.life.geyser = 0;
}

/** 눈송이 도감에 모은 수 */
export const snowCount = (s: State) => { let n = 0, v = s.life?.snow ?? 0; while (v) { n += v & 1; v >>>= 1; } return n; };
