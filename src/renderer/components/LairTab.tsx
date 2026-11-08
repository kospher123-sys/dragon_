import { useState } from 'react';
import type { State } from '../../engine/engine';
import { DECOR, hasDecor } from '../../engine/engine';
import { T } from '../../engine/data';
import { SPECIES, SPECIES_COLOR, GRADES, GRADE_COLOR } from '../../engine/data';
import type { Settings } from '../../shared/types';
import { api, dur, lairName, status, shownOnDesktop, stage } from '../util';
import { Portrait } from './Portrait';

export function LairTab({ state, settings, setSettings, selected, onSelect, focusLair, edition }: {
  edition?: string;
  state: State; settings: Settings; setSettings: (s: Settings) => void; selected: string; onSelect: (id: string) => void; focusLair: number | null;
}) {
  const [sort, setSort] = useState<'default' | 'level' | 'wins' | 'status'>('default');
  const [autoOnly, setAutoOnly] = useState(false);
  const alive = state.dragons.filter((d) => !d.dead);
  const order = (list: typeof alive) => {
    const l = autoOnly ? list.filter((d) => d.auto !== undefined) : [...list];
    if (sort === 'level') l.sort((a, b) => b.level - a.level || b.grade - a.grade);
    else if (sort === 'wins') l.sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0));
    else if (sort === 'status') l.sort((a, b) => Number(!!b.mission) - Number(!!a.mission) || (a.hp / a.max) - (b.hp / b.max));
    return l;
  };
  const groups = SPECIES.map((_, i) => ({ i, list: order(alive.filter((d) => d.home === i)) })).filter((g) => g.i === 0 || g.list.length);
  const shown = alive.filter((d) => shownOnDesktop(settings.desktop, d)).length;
  const many = settings.perf === 'low' && shown > 6;

  const toggle = async (id: string, v: boolean) => {
    setSettings(await api().setSettings({ desktop: { ...settings.desktop, [id]: v } }));
  };
  const setAutoAll = async (list: typeof alive, region: number | null) => {
    for (const d of list) await api().act({ type: 'auto', id: d.id, region });
  };
  const setGroup = async (ids: string[], v: boolean) => {
    const desktop = { ...settings.desktop };
    for (const id of ids) desktop[id] = v;
    setSettings(await api().setSettings({ desktop }));
  };

  return (
    <>
      <div className="heading">
        <div>
          <small>SANCTUARY</small>
          <h1>레어와 드래곤</h1>
        </div>
        <span className="muted">살아 있는 드래곤 {alive.length}마리 · 바탕화면 표시 {shown}마리</span>
      </div>
      {edition === 'test' && (() => {
        // 최근 게임 하루(실제 약 1시간) 동안의 레어 소식
        const recent = state.events.filter((e) => e.time > state.time - T.DAY);
        const n = (k: string) => recent.filter((e) => e.kind === k).length;
        return (
          <div className="today-card">
            <b>최근 게임 하루</b>
            <span>승리 {n('win')}</span><span>후퇴·패배 {n('retreat') + n('loss')}</span><span>레벨업 {n('level')}</span>
            <span>부화 {n('hatch')}</span><span>인간 방문 {n('human')}</span><span>수련·업적 {n('train')}</span>
            {n('death') > 0 && <span className="error-text">전사 {n('death')}</span>}
          </div>
        );
      })()}
      {many && <div className="warn-banner">저사양 모드에서 바탕화면에 {shown}마리를 표시 중입니다. 많이 표시하면 느려질 수 있어요.</div>}
      {state.battle && (
        <div className="battle-banner">
          <span>⚔ 전투 진행 중 · {state.battle.place} · {state.dragons.find((d) => d.id === state.battle!.dragon)?.name}</span>
          <button onClick={() => api().openBattle()}>전투 보기</button>
        </div>
      )}
      {edition === 'test' && (
        <div className="sort-row">
          <label className="field">정렬
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="default">기본</option>
              <option value="level">레벨·등급</option>
              <option value="wins">승리 수</option>
              <option value="status">출격 중·다친 순</option>
            </select>
          </label>
          <button onClick={async () => { const e = await api().photo(); if (e) alert(e); }}>📷 바탕화면 드래곤 사진</button>
          <label className="check"><input type="checkbox" checked={autoOnly} onChange={(e) => setAutoOnly(e.target.checked)} /> 자동 사냥 중만 보기</label>
        </div>
      )}
      <section className="nest-box">
        <h3>황혼의 레어 둥지</h3>
        <div className="egg-grid">
          {state.eggs.map((e) => (
            <div key={e.id} className="egg-card">
              <span style={{ color: SPECIES_COLOR[e.species] }}>◈</span>
              <div>
                <strong>{SPECIES[e.species]}의 알{e.second !== undefined ? ` (× ${SPECIES[e.second]})` : ''}</strong>
                <p>부화까지 {dur(e.left)} · {e.generation}세대</p>
              </div>
            </div>
          ))}
          {!state.eggs.length && <p className="muted">둥지가 비어 있습니다. 성체가 알을 낳거나 다른 종족이 알을 맡깁니다.</p>}
        </div>
        {edition === 'test' && (
          <div className="decor-row">
            <span className="muted">둥지 장식 · 유물 {state.resources}</span>
            {DECOR.map(([id, name, cost, desc]) => (
              <button key={id} disabled={hasDecor(state, id) || state.resources < cost} title={desc}
                onClick={() => api().act({ type: 'decor', item: id })}>
                {hasDecor(state, id) ? `✓ ${name}` : `${name} · ${cost}`}
              </button>
            ))}
          </div>
        )}
      </section>
      {groups.map((g) => (
        <section key={g.i} className={'lair-group' + (focusLair === g.i ? ' focus' : '')} id={'lair-' + g.i}>
          <header>
            <h3 style={{ color: SPECIES_COLOR[g.i] }}>♜ {lairName(g.i)}</h3>
            <span className="muted">{g.i === 0 ? '내 레어' : `친밀도 ${state.relations[g.i]}`} · {g.list.length}마리</span>
            {g.list.length > 0 && (
              <span className="group-actions">
                <button className="link" onClick={() => setGroup(g.list.map((d) => d.id), true)}>모두 표시</button>
                <button className="link" onClick={() => setGroup(g.list.map((d) => d.id), false)}>모두 끄기</button>
                {g.i === 0 && edition === 'test' && (
                  <>
                    <button className="link" onClick={() => setAutoAll(g.list, -1)}>모두 자동 사냥</button>
                    <button className="link" onClick={() => setAutoAll(g.list, null)}>자동 사냥 끄기</button>
                  </>
                )}
              </span>
            )}
          </header>
          <table className="roster-table">
            <thead>
              <tr><th></th><th>이름</th><th>등급</th><th>Lv</th><th>단계</th><th>상태</th><th>남은 시간</th><th>바탕화면</th></tr>
            </thead>
            <tbody>
              {g.list.map((d) => {
                const st = status(state, d);
                return (
                  <tr key={d.id} className={d.id === selected ? 'sel' : ''} onClick={() => onSelect(d.id)}>
                    <td className="mini"><Portrait d={d} size={56} /></td>
                    <td style={{ color: GRADE_COLOR[d.grade] }}>{d.grade === 4 ? '♛ ' : ''}{d.name}{d.auto !== undefined && !d.dead ? <span className="auto-tag">자동</span> : null}</td>
                    <td>{GRADES[d.grade]}</td>
                    <td>{d.level}</td>
                    <td>{stage(d)}</td>
                    <td className={'tone-' + st.tone}>{st.text}</td>
                    <td>{st.left !== undefined ? dur(st.left) : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <label className="switch">
                        <input type="checkbox" checked={shownOnDesktop(settings.desktop, d)} onChange={(e) => toggle(d.id, e.target.checked)} />
                        <span />
                      </label>
                    </td>
                  </tr>
                );
              })}
              {!g.list.length && <tr><td colSpan={8} className="muted">지금 레어에 머무는 드래곤이 없습니다.</td></tr>}
            </tbody>
          </table>
        </section>
      ))}
      <p className="fine">체크한 드래곤이 바탕화면을 돌아다닙니다. 다른 레어의 드래곤은 보여 주기만 하며 게임에는 영향이 없습니다.</p>
    </>
  );
}
