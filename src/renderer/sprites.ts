// 그림 시트 정보. 확장 그림(그림 보강 가이드 규격)이 있으면 그것을, 없으면 기본 그림을 쓴다.
//
// species.png       : 4열(엎드림·걷기·브레스·비행) × 행. 칸 384×256.
//                     4행(기본: 레드·블루·에메랄드·백은) 또는 11행(레드~폭풍 전부).
// species-walk.png  : (선택) 4열(걷기 1~4프레임) × 11행. 칸 384×256.
// monsters-desk.png : (선택) 8열(걷기1~4·피격·기절1~2·일어남) × 4행(슬라임·고블린·오우거·리치). 칸 256×256.

export const SPECIES_CELL = { w: 384, h: 256 };

function load(name: string, onload?: () => void) {
  const i = new Image();
  i.onload = () => onload?.();
  i.src = `bf://img/${name}.png`;
  return i;
}

const ok = (i: HTMLImageElement) => i.complete && i.naturalWidth > 0;

export const sheets = {
  species: load('species'),
  speciesWalk: load('species-walk'),
  monstersDesk: load('monsters-desk'),
};

/** species.png 의 행 수 (4 또는 11) */
export function speciesRows(): number {
  const i = sheets.species;
  if (!ok(i)) return 4;
  const cellH = (i.naturalWidth / 4) * (SPECIES_CELL.h / SPECIES_CELL.w);
  return Math.max(1, Math.round(i.naturalHeight / cellH));
}

/** 다른 종(1~11)의 시트 행과 색조 변경 여부 */
export function speciesRow(species: number): { row: number; rows: number; hue: string | null } {
  const rows = speciesRows();
  if (rows >= 11) return { row: species - 1, rows, hue: null };
  return { row: (species - 1) % 4, rows, hue: species > 4 ? `hue-rotate(${species * 29}deg)` : null };
}

export const hasSpeciesWalk = () => ok(sheets.speciesWalk);
export const hasMonstersDesk = () => ok(sheets.monstersDesk);
