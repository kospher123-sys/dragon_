import type { Api } from '../shared/types';
import type { Dragon, State, Place } from '../engine/engine';
import { missionTarget, isAdult } from '../engine/engine';
import { T, SPECIES, REGIONS, LAIR_POS, TOWN_POS } from '../engine/data';

declare global {
  interface Window { api: Api }
}
export const api = () => window.api;

export function dur(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}시간 ${m}분`;
  if (m) return `${m}분 ${String(s).padStart(2, '0')}초`;
  return `${s}초`;
}

/** 게임 시각: 1일 = T.DAY 초를 24시간으로 환산 */
export function clock(time: number): string {
  const day = Math.floor(time / T.DAY) + 1;
  const frac = (time % T.DAY) / T.DAY;
  const mins = Math.floor(frac * 24 * 60);
  return `제 ${day}일 · ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export function placeName(s: State, p: Place): string {
  if (p.type === 'region') return REGIONS[p.index]?.name ?? '?';
  if (p.type === 'town') return s.towns[p.index]?.name ?? '인간 마을';
  return p.index === 0 ? '황혼의 레어' : SPECIES[p.index] + ' 레어';
}

export function placePos(p: Place): [number, number] {
  if (p.type === 'region') return [REGIONS[p.index].x, REGIONS[p.index].y];
  if (p.type === 'town') return TOWN_POS[p.index] ?? TOWN_POS[0];
  return LAIR_POS[p.index] ?? LAIR_POS[0];
}

export function lairName(i: number) {
  return i === 0 ? '황혼의 레어' : SPECIES[i] + ' 레어';
}

export interface Status { text: string; left?: number; tone: 'rest' | 'move' | 'fight' | 'dead' | 'away' }

export function status(s: State, d: Dragon): Status {
  if (d.dead) return { text: '추모', tone: 'dead' };
  if (s.battle?.dragon === d.id) return { text: `교전 중 · ${s.battle.place}`, tone: 'fight' };
  const m = d.mission;
  if (m) {
    const to = placeName(s, missionTarget(m));
    const text = m.kind === 'hunt' ? `${to} 탐험 이동`
      : m.kind === 'support' ? `${to} 지원 이동`
      : m.kind === 'migrate' ? `${to}로 이주 중`
      : m.kind === 'revenge' ? `${to} 보복 비행`
      : '레어로 귀환 중';
    return { text, left: m.left, tone: 'move' };
  }
  if (d.home !== 0) return { text: `${lairName(d.home)} 거주`, tone: 'away' };
  if (d.hp < d.max - 0.5 || d.energy < 99.5) return { text: '레어에서 휴식·회복 중', tone: 'rest' };
  return { text: '레어에서 대기', tone: 'rest' };
}

export const stage = (d: Dragon) => (d.dead ? '추모' : isAdult(d) ? '성체' : '어린 용');

export function shownOnDesktop(desktop: Record<string, boolean>, d: Dragon) {
  return desktop[d.id] ?? d.home === 0;
}
