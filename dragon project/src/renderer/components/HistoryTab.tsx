import { useState } from 'react';
import type { State, EventKind } from '../../engine/engine';
import { ACHIEVEMENTS } from '../../engine/engine';
import { SPECIES } from '../../engine/data';
import { clock } from '../util';

const FILTERS: [string, EventKind[] | null][] = [
  ['전체', null],
  ['전투', ['win', 'loss', 'retreat', 'raid', 'fall', 'ruin']],
  ['성장', ['level', 'adult', 'hatch', 'egg', 'name', 'train']],
  ['인간', ['human', 'town', 'ruin']],
  ['이동', ['depart', 'return', 'migrate']],
  ['추모', ['death', 'over']],
];

export function HistoryTab({ state, archives }: { state: State; archives: { file: string; title: string }[] }) {
  const [f, setF] = useState(0);
  const kinds = FILTERS[f][1];
  const list = kinds ? state.events.filter((e) => kinds.includes(e.kind)) : state.events;
  const dead = state.dragons.filter((d) => d.dead).sort((a, b) => (b.diedAt ?? 0) - (a.diedAt ?? 0));
  return (
    <>
      <div className="heading">
        <div>
          <small>CHRONICLE</small>
          <h1>레어가 기억하는 것들</h1>
        </div>
        <span className="muted">{state.chronicle}번째 연대기</span>
      </div>
      {(state.stats || state.achievements) && (
        <section className="achv">
          <h3>업적 <small className="muted">{state.achievements?.length ?? 0} / {ACHIEVEMENTS.length} · 달성마다 유물 +50</small></h3>
          <div className="achv-grid">
            {ACHIEVEMENTS.map(([id, name, desc]) => {
              const ok = state.achievements?.includes(id);
              return <div key={id} className={'achv-card' + (ok ? ' ok' : '')} title={desc}><b>{ok ? '★' : '☆'} {name}</b><span>{desc}</span></div>;
            })}
          </div>
        </section>
      )}
      <div className="two-col">
        <section>
          <div className="chips">
            {FILTERS.map(([label], i) => <button key={label} className={i === f ? 'active' : ''} onClick={() => setF(i)}>{label}</button>)}
          </div>
          <ul className="events">
            {list.map((e, i) => <li key={i} className={'ev-' + e.kind}><time>{clock(e.time)}</time>{e.text}</li>)}
            {!list.length && <li className="muted">기록이 없습니다.</li>}
          </ul>
        </section>
        <aside>
          <h3>추모</h3>
          <ul className="memorial">
            {dead.map((d) => <li key={d.id}>† {d.name} <span className="muted">· {SPECIES[d.species]} · Lv.{d.level}{d.diedAt !== undefined ? ' · ' + clock(d.diedAt) : ''}</span></li>)}
            {!dead.length && <li className="muted">아직 떠난 드래곤이 없습니다.</li>}
          </ul>
          <h3>지난 연대기</h3>
          <ul className="memorial">
            {archives.map((a) => <li key={a.file}>{a.title}</li>)}
            {!archives.length && <li className="muted">보관된 연대기가 없습니다.</li>}
          </ul>
        </aside>
      </div>
    </>
  );
}
