import { useState } from 'react';
import type { State, Summary } from '../../engine/engine';
import { guardian, riskEstimate } from '../../engine/engine';
import { SPECIES } from '../../engine/data';
import { api, dur } from '../util';

export function StartScreen() {
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="overlay">
      <form className="modal start" onSubmit={async (e) => { e.preventDefault(); setErr(await api().act({ type: 'start', name })); }}>
        <small>THE BLACKFLAME CHRONICLE</small>
        <h1>첫 흑염룡의 이름</h1>
        <p>이 이름은 혈통과 레어의 역사에 남습니다. 이름을 새기면 세계가 흐르기 시작합니다.</p>
        <input autoFocus maxLength={18} value={name} onChange={(e) => setName(e.target.value)} placeholder="흑염룡의 이름 (최대 18자)" />
        <button className="primary" disabled={!name.trim()}>이름을 새기고 시작 →</button>
        {err && <p className="error-text">{err}</p>}
        <p className="fine">게임은 이 컴퓨터의 시간에 맞춰 진행됩니다. 프로그램을 끄면 다음에 켤 때 최대 8시간까지 따라잡습니다.</p>
      </form>
    </div>
  );
}

export function SupportModal({ state, onLater }: { state: State; onLater: () => void }) {
  const p = state.prompt!;
  const g = guardian(state);
  const left = p.expires - state.time;
  const defenders = state.dragons.filter((d) => !d.dead && d.home === 0 && !d.mission && d.id !== g?.id).length;
  return (
    <div className="overlay">
      <div className="modal">
        <small>TELEPATHY</small>
        <h2>{SPECIES[p.target]} 레어의 지원 요청</h2>
        <p>성체의 텔레파시가 닿았습니다. 도착 전에 레어가 무너질 수도 있습니다.</p>
        <table className="kv">
          <tbody>
            <tr><th>수호자</th><td>{g ? `${g.name} · HP ${Math.round(g.hp)}/${g.max}` : '없음'}</td></tr>
            <tr><th>적 전력</th><td>{p.known && g ? `${p.force} · 사망 위험 ${riskEstimate(g, p.force).join('~')}% (추정)` : '미확인 · 생존 여부 예측 불가'}</td></tr>
            <tr><th>남는 수비 드래곤</th><td>{defenders}마리</td></tr>
            <tr><th>지원 보상</th><td>친밀도 +20 · 유물 30</td></tr>
            <tr><th>거절하면</th><td>친밀도 −8</td></tr>
            <tr><th>이동</th><td>편도 9분</td></tr>
          </tbody>
        </table>
        <p className="countdown">{dur(left)} 안에 정하지 않으면 레어에 남습니다.</p>
        <div className="row">
          <button onClick={() => api().act({ type: 'support', accept: false })}>남아서 레어 지키기</button>
          <button className="primary" onClick={() => api().act({ type: 'support', accept: true })}>지원 출발</button>
        </div>
        <button className="link" onClick={onLater}>나중에 정하기</button>
      </div>
    </div>
  );
}

export function SummaryModal({ s, onClose }: { s: Summary; onClose: () => void }) {
  return (
    <div className="overlay">
      <div className="modal">
        <small>WHILE YOU WERE AWAY</small>
        <h2>자리 비운 {dur(s.seconds)} 동안</h2>
        <table className="kv">
          <tbody>
            <tr><th>레벨업</th><td>{s.levels}회</td></tr>
            <tr><th>부화</th><td>{s.hatches}마리</td></tr>
            <tr><th>전투</th><td>승리 {s.wins} · 패배·후퇴 {s.losses}</td></tr>
            <tr><th>레어 습격</th><td>{s.raids}회{s.falls ? ` · 함락 ${s.falls}회` : ''}</td></tr>
            <tr><th>인간 세력</th><td>새 정착지 {s.towns}곳 · 초토화 {s.ruins}곳{s.humans ? ` · 방문 ${s.humans}번` : ''}</td></tr>
            {(s.autoHunts ?? 0) > 0 && <tr><th>자동 사냥</th><td>출발 {s.autoHunts}번</td></tr>}
            {s.resources !== undefined && s.resources !== 0 && <tr><th>고대 유물</th><td>{s.resources > 0 ? '+' : ''}{s.resources}</td></tr>}
          </tbody>
        </table>
        {s.deaths.length > 0 && (
          <>
            <h3>떠난 드래곤</h3>
            <ul className="events">{s.deaths.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </>
        )}
        {!!s.titles?.length && (
          <>
            <h3>새 칭호</h3>
            <ul className="events">{s.titles.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </>
        )}
        {s.over && <p className="error-text">혈통이 끝났습니다.</p>}
        <p className="fine">자세한 사건은 역사 탭에 있습니다.</p>
        <button className="primary" onClick={onClose}>확인</button>
      </div>
    </div>
  );
}

export function OverModal({ state }: { state: State }) {
  return (
    <div className="overlay">
      <div className="modal">
        <small>THE LAST FLAME</small>
        <h2>흑염룡의 마지막 불꽃</h2>
        <p>살아 있는 흑염룡과 알이 모두 사라졌습니다. {state.chronicle}번째 연대기는 기록으로 보관됩니다.</p>
        <div className="row">
          <button onClick={() => api().exportSave()}>연대기 내보내기</button>
          <button className="primary" onClick={() => api().newChronicle()}>새 연대기 시작</button>
        </div>
      </div>
    </div>
  );
}
