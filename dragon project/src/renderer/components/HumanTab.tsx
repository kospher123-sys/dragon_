import type { State } from '../../engine/engine';
import { REGIONS, SPECIES, SPECIES_COLOR, T } from '../../engine/data';
import { dur } from '../util';

export function HumanTab({ state }: { state: State }) {
  const total = state.towns.reduce((a, t) => a + t.army, 0);
  const nextTown = state.towns.length < 8 ? (state.towns.length - 2) * T.TOWN - state.time : null;
  return (
    <>
      <div className="heading">
        <div>
          <small>HUMAN REALMS</small>
          <h1>인간 세력</h1>
        </div>
        <span className="muted">총병력 {Math.floor(total).toLocaleString()}명 · 거점 {state.towns.length}/8{nextTown !== null && nextTown > 0 ? ` · 다음 정착지까지 ${dur(nextTown)}` : ''}</span>
      </div>
      <img className="village-art" src="bf://img/village.png" alt="인간 마을" />
      {(state.stats || state.nextHuman !== undefined) && (() => {
        const fame = state.dragons.filter((d) => !d.dead && d.home === 0).reduce((n, d) => n + (d.wins ?? 0), 0);
        const st = state.stats;
        const visits = state.events.filter((e) => e.kind === 'human').slice(0, 6);
        const mood = fame >= 40 ? '전설 속 공포' : fame >= 20 ? '두려움' : fame >= 8 ? '경계' : '호기심';
        return (
          <section className="human-rel">
            <h3>인간들이 보는 우리 레어 <small className="muted">· 명성 {fame} ({mood})</small></h3>
            <p className="fine">명성은 내 레어 드래곤들의 승리 합입니다. 높을수록 음유시인과 결투 도전자가 자주 찾아옵니다.</p>
            {st && <p className="muted">받은 공물 {st.tributes}번 · 결투 승리 {st.duelWins}번 · 초토화 {st.ruins}번 · 습격 방어 {st.raidWins}번{state.bounty ? ` · 오늘 바탕화면 퇴치 보상 ${state.bounty.count}/20` : ''}</p>}
            <ul className="events">{visits.map((e, i) => <li key={i}>{e.text}</li>)}{!visits.length && <li className="muted">아직 찾아온 인간이 없습니다.</li>}</ul>
          </section>
        );
      })()}
      <table className="data">
        <thead><tr><th>거점</th><th>병력</th><th>상태</th><th>원정대</th></tr></thead>
        <tbody>
          {state.towns.map((t, i) => {
            const p = state.patrols.find((x) => x.town === i);
            return (
              <tr key={t.name}>
                <td>⌂ {t.name}</td>
                <td>{Math.floor(t.army).toLocaleString()}명</td>
                <td className={t.ruin > 0 ? 'tone-fight' : ''}>{t.ruin > 0 ? `초토화 · 재건까지 ${dur(t.ruin)}` : '번영 중'}</td>
                <td>{p ? `${REGIONS[p.target].name} 방면 · 전력 ${Math.round(p.force)}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>레어 간 친밀도</h3>
      <p className="fine">친밀도가 0 아래인 레어가 6곳 이상이면 적대 드래곤이 인간 연합군과 손잡고 레어를 습격합니다.</p>
      <div className="relations">
        {SPECIES.map((s, i) => i === 0 ? null : (
          <div key={s} className="rel">
            <span style={{ color: SPECIES_COLOR[i] }}>♜ {s}</span>
            <div className="bar"><i style={{ width: Math.max(0, Math.min(100, state.relations[i])) + '%', background: state.relations[i] < 0 ? '#e0605a' : SPECIES_COLOR[i] }} /></div>
            <b className={state.relations[i] < 0 ? 'tone-fight' : ''}>{state.relations[i]}</b>
          </div>
        ))}
      </div>
    </>
  );
}
