import type { Dragon } from '../../engine/engine';
import { isAdult } from '../../engine/engine';
import { speciesRow } from '../sprites';

/** 드래곤 초상. 흑염룡은 sheet.png(8×11칸), 다른 종은 species.png(4×4칸)를 쓴다. */
export function Portrait({ d, size = 160, pose = 0 }: { d: Dragon; size?: number; pose?: number }) {
  const scale = (isAdult(d) ? 1 : 0.65) * [0.8, 0.94, 1, 1.07, 1.17][d.grade];
  const black = d.species === 0;
  const sp = black ? null : speciesRow(d.species);
  const style: React.CSSProperties = black
    ? {
        backgroundImage: 'url(bf://img/sheet.png)',
        backgroundSize: '800% 1100%',
        backgroundPosition: `0% ${(6 / 10) * 100}%`,
        width: size,
        height: size * (208 / 192),
      }
    : {
        backgroundImage: 'url(bf://img/species.png)',
        backgroundSize: `400% ${sp!.rows * 100}%`,
        backgroundPosition: `${(pose / 3) * 100}% ${(sp!.row / Math.max(1, sp!.rows - 1)) * 100}%`,
        width: size,
        height: size * (256 / 384),
      };
  const filters: string[] = [];
  if (sp?.hue) filters.push(sp.hue);
  if (d.grade === 4) filters.push('drop-shadow(0 0 10px #d06cff)');
  if (d.dead) filters.push('grayscale(1) brightness(0.6)');
  return (
    <div className="portrait" style={{ width: size, height: size * 0.9 }}>
      <div className="sprite" style={{ ...style, transform: `scale(${scale})`, filter: filters.join(' ') || undefined }} />
      {d.grade === 4 && <span className="crown">♛</span>}
    </div>
  );
}
