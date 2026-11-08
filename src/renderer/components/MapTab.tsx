import { useState } from 'react';
import type { State, Dragon } from '../../engine/engine';
import { canHunt, missionTarget, travelTime, rule, regionYield } from '../../engine/engine';
import { REGIONS, LAIR_POS, TOWN_POS, SPECIES, SPECIES_COLOR, T } from '../../engine/data';
import { api, dur, placeName, placePos } from '../util';

export function MapTab({ state, selected, onSelect, onLair }: {
  state: State; selected: Dragon; onSelect: (id: string) => void; onLair: (i: number) => void;
}) {
  const [region, setRegion] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const r = REGIONS[region];
  const why = canHunt(state, selected);
  const travelers = state.dragons.filter((d) => !d.dead && d.mission);

  const send = async () => {
    setErr(await api().act({ type: 'hunt', id: selected.id, target: region }));
  };

  return (
    <>
      <div className="heading">
        <div>
          <small>THE KNOWN WORLD</small>
          <h1>잠들지 않는 대륙</h1>
        </div>
        <span className="muted">레어 {SPECIES.length}곳 · 인간 거점 {state.towns.length}곳 · 이동 중 {travelers.length}마리</span>
      </div>
      <div className="map">
        <img className="map-bg" src="bf://img/map.png" alt="세계지도" />
        <svg className="routes" viewBox="0 0 100 100" preserveAspectRatio="none">
          {travelers.map((d) => {
            const m = d.mission!;
            const [x1, y1] = placePos(m.from ?? { type: 'lair', index: m.kind === 'migrate' ? 0 : d.home });
            const [x2, y2] = placePos(missionTarget(m));
            return <line key={d.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={SPECIES_COLOR[d.species]} />;
          })}
        </svg>
        {REGIONS.map((reg, i) => (
          <button key={reg.name} className={'region' + (i === region ? ' selected' : '')} style={{ left: reg.x + '%', top: reg.y + '%' }} onClick={() => setRegion(i)}>
            <span>◇</span>{reg.name}{rule(state, 'depletion') && regionYield(state, i) < 0.99 ? ` · ${Math.round(regionYield(state, i) * 100)}%` : ''}
          </button>
        ))}
        {LAIR_POS.map(([x, y], i) => (
          <button key={i} className="lair-marker" style={{ left: x + '%', top: y + '%', color: SPECIES_COLOR[i] }} title={`${SPECIES[i]} 레어 · 친밀도 ${state.relations[i]}`} onClick={() => onLair(i)}>
            ♜<span>{i === 0 ? '황혼의 레어' : SPECIES[i]}</span>
          </button>
        ))}
        {state.towns.map((t, i) => (
          <span key={t.name} className={'town-marker' + (t.ruin > 0 ? ' ruined' : '')} style={{ left: TOWN_POS[i][0] + '%', top: TOWN_POS[i][1] + '%' }} title={`${t.name} · 병력 ${Math.floor(t.army).toLocaleString()}`}>
            ⌂<span>{t.name}</span>
          </span>
        ))}
        {state.patrols.map((p, i) => {
          const [tx, ty] = TOWN_POS[p.town] ?? TOWN_POS[0];
          const k = Math.sin((p.progress / p.duration) * Math.PI);
          const reg = REGIONS[p.target];
          return <span key={'p' + i} className="patrol" title="도로를 이동하는 인간 원정대" style={{ left: tx + (reg.x - tx) * k + '%', top: ty + (reg.y - ty) * k + '%' }}>⚑</span>;
        })}
        {travelers.map((d) => {
          const m = d.mission!;
          const [x1, y1] = placePos(m.from ?? { type: 'lair', index: m.kind === 'migrate' ? 0 : d.home });
          const [x2, y2] = placePos(missionTarget(m));
          const p = 1 - m.left / m.total;
          return (
            <button key={d.id} className={'flyer' + (d.id === selected.id ? ' me' : '')} style={{ left: x1 + (x2 - x1) * p + '%', top: y1 + (y2 - y1) * p + '%', borderColor: SPECIES_COLOR[d.species] }}
              title={`${d.name}${d.auto !== undefined ? ' · 자동 사냥' : ''} · ${placeName(state, missionTarget(m))} · ${dur(m.left)} 남음`} onClick={() => onSelect(d.id)}>
              <i style={{ background: SPECIES_COLOR[d.species] }} />
            </button>
          );
        })}
        <div className="map-legend">◇ 사냥 지역　♜ 드래곤 레어　⌂ 인간 마을　⚑ 원정대　● 이동 중인 드래곤</div>
      </div>
      <section className="destination">
        <div>
          <small>EXPEDITION DESTINATION</small>
          <h2>{r.name}</h2>
          <p>{r.terrain}{rule(state, 'depletion') ? ` · 풍요도 ${Math.round(regionYield(state, region) * 100)}%` : ''}</p>
          <div className="tags">{r.monsters.map((m) => <span key={m}>{m}</span>)}</div>
        </div>
        <div className="dispatch">
          <span>위험도 {'◆'.repeat(r.risk)}{'◇'.repeat(5 - r.risk)}</span>
          <p>편도 {dur(travelTime(selected))} · 전투 결과에 따라 성장</p>
          <button className="primary" disabled={!!why} onClick={send} title={why ?? ''}>
            {why ? why : `${selected.name} 사냥 보내기 →`}
          </button>
          {!selected.dead && selected.home === 0 && (
            <button className="link" onClick={async () => setErr((await api().act({ type: 'auto', id: selected.id, region: selected.auto === region ? null : region })) ?? (selected.auto === region ? '자동 사냥을 껐습니다' : `${r.name} 자동 사냥으로 정했습니다`))}>
              {selected.auto === region ? '이 지역 자동 사냥 끄기' : '이 지역으로 자동 사냥'}
            </button>
          )}
          {err && <p className="error-text">{err}</p>}
        </div>
      </section>
    </>
  );
}
