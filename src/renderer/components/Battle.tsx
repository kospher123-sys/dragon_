import { useEffect, useRef, useState } from 'react';
import type { State, Battle as B } from '../../engine/engine';
import { COMMANDS } from '../../engine/engine';
import { REGIONS, ROLES } from '../../engine/data';
import { api } from '../util';
import { speciesRow } from '../sprites';

const NAMES = ['castle', 'sheet', 'party-motion', 'fx', 'map', 'species', 'monsters', 'village'] as const;
type Imgs = Record<(typeof NAMES)[number], HTMLImageElement>;

function load(): Imgs {
  const o = {} as Imgs;
  for (const n of NAMES) {
    const i = new Image();
    i.src = `bf://img/${n}.png`;
    o[n] = i;
  }
  return o;
}

/** 전투 화면 (웹 버전 연출을 옮김). state가 바뀌면 다음 프레임에 반영된다. */
export function BattleCanvas({ state, paused }: { state: State; paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cur = useRef(state);
  cur.current = state;
  useEffect(() => {
    const imgs = load();
    let frame = 0, raf = 0;
    const ok = (i: HTMLImageElement) => i.complete && i.naturalWidth > 0;
    const draw = () => {
      const g = ref.current?.getContext('2d');
      const b = cur.current.battle;
      if (!g || !b) { raf = requestAnimationFrame(draw); return; }
      const d = cur.current.dragons.find((x) => x.id === b.dragon);
      if (!d) { raf = requestAnimationFrame(draw); return; }
      if (!paused) frame++;
      const u = frame / 60;
      g.clearRect(0, 0, 1000, 440);
      g.fillStyle = '#151320';
      g.fillRect(0, 0, 1000, 440);
      const field = b.kind === 'monster' || b.kind === 'encounter';
      const bg = field ? imgs.map : b.kind === 'revenge' ? imgs.village : imgs.castle;
      if (ok(bg)) {
        if (field) {
          const r = REGIONS[b.target % 6];
          const sx = Math.max(0, Math.min(bg.width * 0.65, (r.x / 100) * bg.width - bg.width * 0.18));
          g.drawImage(bg, sx, 0, bg.width * 0.35, bg.height, 0, 0, 1000, 440);
        } else g.drawImage(bg, 0, 60, 1000, 330);
      }
      const cell = (img: HTMLImageElement, c: number, r: number, cols: number, rows: number, x: number, y: number, w: number, h: number) => {
        if (ok(img)) g.drawImage(img, (c * img.width) / cols, (r * img.height) / rows, img.width / cols, img.height / rows, x, y, w, h);
      };
      const casting = b.dc > 2.1;
      g.save();
      if (d.species === 0) cell(imgs.sheet, Math.floor(u * 7) % 6, casting ? 7 : 1, 8, 11, 45 + Math.sin(u * 1.7) * 22, 70, 310, 336);
      else {
        const sp = speciesRow(d.species);
        if (sp.hue) g.filter = sp.hue;
        cell(imgs.species, casting ? 2 : 1, sp.row, 4, sp.rows, 30 + Math.sin(u * 1.7) * 22, 120, 360, 240);
      }
      g.restore();
      drawEnemies(g, imgs, b, u, cell, ok);
      if (casting) {
        g.globalCompositeOperation = 'screen';
        g.globalAlpha = 0.65 + Math.sin(u * 20) * 0.25;
        cell(imgs.fx, b.phase % 2, Math.floor((b.phase % 4) / 2), 2, 2, 230, 130, 460, 220);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      g.fillStyle = '#fff';
      g.font = 'bold 20px sans-serif';
      g.fillText(b.skill, 32, 410);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [paused]);
  return <canvas ref={ref} width={1000} height={440} className="battle-canvas" />;
}

function drawEnemies(
  g: CanvasRenderingContext2D, imgs: Imgs, b: B, u: number,
  cell: (img: HTMLImageElement, c: number, r: number, cols: number, rows: number, x: number, y: number, w: number, h: number) => void,
  ok: (i: HTMLImageElement) => boolean,
) {
  for (let e = 0; e < 6; e++) {
    const role = ROLES[e];
    const unit = b.units.find((x) => x.role === role);
    if (b.kind === 'monster') {
      if (!b.units[e] || b.units[e].hp <= 0) continue;
    } else if (!b.roles.includes(role) || (unit && unit.hp <= 0)) continue;
    const x = 470 + (e % 3) * 145 + Math.sin(u * (1 + e * 0.13) + e) * 25;
    const y = 140 + Math.floor(e / 3) * 85 + Math.cos(u + e) * 8;
    const target = b.kind === 'monster' ? b.units[e] : unit;
    if (b.kind === 'monster') {
      const place = b.place;
      const row = place.includes('슬라임') ? 0 : /고블린|오크|리자드|늑대/.test(place) ? 1 : /골렘|오우거|설인|거인|히드라|트렌트/.test(place) ? 2 : 3;
      const m = imgs.monsters, cuts = [0, 0.21, 0.425, 0.68, 1];
      if (ok(m)) g.drawImage(m, ((Math.floor(u * 4 + e) % 4) * m.width) / 4, cuts[row] * m.height, m.width / 4, (cuts[row + 1] - cuts[row]) * m.height, x, y, 150, 150);
    } else {
      g.save();
      g.translate(x + 120, y);
      g.scale(-1, 1);
      cell(imgs['party-motion'], Math.floor(u * 5 + e) % 4, e, 4, 6, 0, 0, 120, 150);
      g.restore();
    }
    g.fillStyle = '#ece2d7';
    g.font = '14px sans-serif';
    g.fillText(b.kind === 'monster' ? b.place.split(' · ')[1] : role, x + 35, y + 145);
    g.fillStyle = '#75c8b4';
    g.fillRect(x + 25, y - 8, 70 * Math.max(0, (target?.hp ?? b.hp) / (target?.max ?? b.max)), 3);
  }
}

export function BattlePanel({ state, paused }: { state: State; paused: boolean }) {
  const b = state.battle;
  if (!b) return <div className="empty">진행 중인 전투가 없습니다.</div>;
  const d = state.dragons.find((x) => x.id === b.dragon)!;
  return (
    <section className="battle">
      <div className="heading">
        <div>
          <small>LIVE ENCOUNTER</small>
          <h2>{b.place}</h2>
        </div>
        <span className="pill">교전 중 · {Math.ceil(b.count * Math.max(0, b.hp / b.max)).toLocaleString()} 전력</span>
      </div>
      <p>{d.name} · HP {Math.max(0, Math.round(d.hp))}/{d.max}</p>
      <progress value={Math.max(0, d.hp)} max={d.max} />
      <BattleCanvas state={state} paused={paused} />
      {b.morale !== undefined && (() => {
        const wait = Math.max(0, (b.orderReady ?? 0) - b.t);
        const active = b.order && b.order.until > b.t ? COMMANDS.find(([k]) => k === b.order!.type)?.[1] : null;
        return (
          <div className="tactics">
            <div className="morale">
              <span>적 사기 {Math.round(b.morale)}</span>
              <progress className="morale-bar" value={b.morale} max={100} />
              {active && <span className="pill">{active} 중</span>}
            </div>
            <div className="row">
              {COMMANDS.map(([k, name, desc]) => (
                <button key={k} title={desc} disabled={wait > 0 || paused} className={k === 'retreat' ? 'danger' : ''}
                  onClick={() => api().act({ type: 'command', order: k })}>{name}</button>
              ))}
              <span className="fine">{wait > 0 ? `다음 명령까지 ${Math.ceil(wait)}초` : '명령할 수 있어요 (8초마다 한 번)'}</span>
            </div>
          </div>
        );
      })()}
      <div className="combat-log">{b.log.slice(0, 3).map((l, i) => <p key={i}>{l}</p>)}</div>
      <p className="fine">병과별 대표 캐릭터가 부대 전체를 표현합니다.</p>
    </section>
  );
}

/** 별도 창(#battle)으로 여는 전투 팝업 */
export function BattlePage() {
  const [snap, setSnap] = useState<{ state: State; paused: boolean } | null>(null);
  useEffect(() => {
    api().init().then((i) => setSnap({ state: i.state, paused: i.paused }));
    return api().onSnapshot((s) => setSnap({ state: s.state, paused: s.paused }));
  }, []);
  if (!snap) return <div className="loading">전투 기록을 불러오는 중…</div>;
  return (
    <div className="battle-page">
      {snap.state.battle ? <BattlePanel state={snap.state} paused={snap.paused} /> : (
        <div className="empty big">
          <h2>전투가 끝났습니다</h2>
          <p>{snap.state.events.find((e) => ['win', 'loss', 'retreat', 'death', 'fall'].includes(e.kind))?.text ?? ''}</p>
          <button onClick={() => window.close()}>창 닫기</button>
        </div>
      )}
    </div>
  );
}
