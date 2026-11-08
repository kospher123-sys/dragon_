import { useEffect, useState } from 'react';
import type { InitData, Settings, Snapshot, Summary } from '../shared/types';
import { SPECIES, GRADES, GRADE_COLOR } from '../engine/data';
import { api, clock, dur, status, stage } from './util';
import { Portrait } from './components/Portrait';
import { MapTab } from './components/MapTab';
import { LairTab } from './components/LairTab';
import { DetailTab } from './components/DetailTab';
import { HistoryTab } from './components/HistoryTab';
import { HumanTab } from './components/HumanTab';
import { SettingsTab } from './components/SettingsTab';
import { StartScreen, SupportModal, SummaryModal, OverModal } from './components/Modals';

const TABS = [
  ['map', '세계 지도'],
  ['lair', '레어'],
  ['detail', '드래곤 상세'],
  ['history', '역사'],
  ['human', '인간 세력'],
  ['settings', '설정'],
] as const;
type Tab = (typeof TABS)[number][0];

export function App() {
  const [init, setInit] = useState<InitData | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState<Tab>('map');
  const [showHelp, setShowHelp] = useState(() => { try { return localStorage.getItem('bf-help-seen') !== '3'; } catch { return true; } });
  const [sel, setSel] = useState('');
  const [focusLair, setFocusLair] = useState<number | null>(null);
  const [laterPrompt, setLaterPrompt] = useState<number | null>(null);

  useEffect(() => {
    api().init().then((i) => {
      setInit(i);
      setSnap(i);
      setSettings(i.settings);
      setSummary(i.summary);
    });
    const offs = [
      api().onSnapshot(setSnap),
      api().onSummary(setSummary),
      api().onFocus((t) => {
        if (t === 'support') setLaterPrompt(null);
        // 알림을 누르면 그 드래곤의 상세로 간다
        if (t.startsWith('dragon:')) { setSel(t.slice(7)); setTab('detail'); }
      }),
    ];
    return () => offs.forEach((f) => f());
  }, []);

  if (!init || !snap || !settings) return <div className="loading">이 컴퓨터의 연대기를 불러오는 중…</div>;
  const s = snap.state;
  if (!s.started) return <StartScreen />;

  const d = s.dragons.find((x) => x.id === sel) ?? s.dragons.find((x) => !x.dead) ?? s.dragons[0];
  const st = status(s, d);
  const select = (id: string) => { setSel(id); };
  const goLair = (i: number) => {
    setFocusLair(i);
    setTab('lair');
    setTimeout(() => document.getElementById('lair-' + i)?.scrollIntoView({ behavior: 'smooth' }), 50);
  };
  const showPrompt = s.prompt && laterPrompt !== s.prompt.expires;

  return (
    <div className="game">
      <header>
        <a className="brand" onClick={() => setTab('map')}>✦ <span>흑염룡의 레어<small>THE BLACKFLAME CHRONICLE</small></span></a>
        <div className="world-clock">
          <i className={snap.paused || s.over ? 'dot frozen' : 'dot'} />
          {s.over ? '연대기 종료' : snap.paused ? '일시정지' : '세계 진행 중'}
          <p>{clock(s.time)}</p>
          {init.edition === 'test' && !s.over && s.started && (
            <small className="muted" title="대략적인 예고입니다">다음 세계 사건 ~{dur(Math.max(0, s.nextEvent - s.time))} · 인간 방문 ~{dur(Math.max(0, (s.nextHuman ?? 900) - s.time))}</small>
          )}
        </div>
        <div className="header-actions">
          {s.prompt && !showPrompt && <button className="alert" onClick={() => setLaterPrompt(null)}>지원 요청 · {dur(s.prompt.expires - s.time)}</button>}
          {s.battle && <button className="alert" onClick={() => api().openBattle()}>⚔ 전투 중</button>}
          <span className={snap.saveError ? 'error-text' : 'muted'}>{snap.saveError ? '저장 실패' : snap.savedAt ? '자동 저장됨' : ''}</span>
          <button onClick={() => api().setPaused(!snap.paused)}>{snap.paused ? '▶ 계속' : 'Ⅱ 일시정지'}</button>
        </div>
      </header>
      {snap.saveError && <div className="error">{snap.saveError}</div>}
      <div className="workspace">
        <aside className="roster">
          <small>YOUR BLOODLINE</small>
          <h2>황혼의 수호자</h2>
          <select aria-label="드래곤 선택" value={d.id} onChange={(e) => select(e.target.value)}>
            {SPECIES.map((sp, i) => {
              const list = s.dragons.filter((x) => (x.dead ? i === 0 && x.species === 0 : x.home === i));
              if (!list.length) return null;
              return (
                <optgroup key={sp} label={i === 0 ? '황혼의 레어' : sp + ' 레어'}>
                  {list.map((x) => <option key={x.id} value={x.id}>{x.dead ? '† ' : ''}{x.name} · Lv.{x.level}</option>)}
                </optgroup>
              );
            })}
          </select>
          <Portrait d={d} size={190} />
          <h2 className="dragon-name" style={{ color: GRADE_COLOR[d.grade] }}>{d.grade === 4 ? '♛ ' : ''}{d.name}</h2>
          <p className="center muted">{SPECIES[d.species]}{d.second !== undefined ? ' × ' + SPECIES[d.second] : ''} · {GRADES[d.grade]} · {d.generation}세대</p>
          <div className="tags">
            <span>Lv. {d.level}</span>
            <span>{stage(d)}</span>
            <span>{d.injury > 1 ? '부상' : '안정'}</span>
          </div>
          {([
            ['생명력', Math.max(0, Math.round(d.hp)), d.max],
            ['기력', Math.floor(d.energy), 100],
            ['경험치', Math.floor(d.xp), d.level * 100],
          ] as const).map(([label, v, max]) => (
            <div className="stat" key={label}>
              <div><span>{label}</span><span>{v} / {max}</span></div>
              <progress value={v} max={max} />
            </div>
          ))}
          <div className={'mission tone-' + st.tone}>
            <i className="dot" /> {st.text}{st.left !== undefined ? ` · ${dur(st.left)}` : ''}
            {d.mission && <progress value={d.mission.total - d.mission.left} max={d.mission.total} />}
          </div>
          <button className="wide" onClick={() => setTab('detail')}>{init.edition === 'test' ? '성장·수련·자동 사냥 ↗' : '성장 기록 ↗'}</button>
          <div className="resource">✧ 고대 유물 <strong>{s.resources}</strong></div>
          {init.edition === 'test' && <div className="test-badge">테스트판 · 본편 저장과 분리됨</div>}
          <p className="fine">당신은 목적지를 선택합니다.<br />여행과 전투의 결과는 용들이 만들어갑니다.</p>
        </aside>
        <main className="main">
          <nav>
            {TABS.map(([k, label]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>)}
          </nav>
          <div className="tab-body">
            {tab === 'map' && <MapTab state={s} selected={d} onSelect={select} onLair={goLair} />}
            {tab === 'lair' && <LairTab edition={init.edition} state={s} settings={settings} setSettings={setSettings} selected={d.id} onSelect={(id) => { select(id); }} focusLair={focusLair} />}
            {tab === 'detail' && <DetailTab state={s} d={d} settings={settings} setSettings={setSettings} />}
            {tab === 'history' && <HistoryTab state={s} archives={init.archives} />}
            {tab === 'human' && <HumanTab state={s} />}
            {tab === 'settings' && <SettingsTab state={s} settings={settings} setSettings={setSettings} init={init} chronicle={s.chronicle} />}
          </div>
        </main>
      </div>
      {showPrompt && <SupportModal state={s} onLater={() => setLaterPrompt(s.prompt!.expires)} />}
      {summary && <SummaryModal s={summary} onClose={() => setSummary(null)} />}
      {!summary && init.edition === 'test' && showHelp && (
        <div className="overlay">
          <div className="modal">
            <small>TEST EDITION</small>
            <h2>테스트판에 새로 생긴 것</h2>
            <ul className="help-list">
              <li><b>성장</b> · 드래곤 상세 탭에서 수련(근력·비늘·날개)과 각성. 고대 유물을 씁니다.</li>
              <li><b>자동 사냥</b> · 드래곤 상세·지도·레어 탭·트레이에서 켭니다. 레어에 지킴이 한 마리는 남깁니다.</li>
              <li><b>인간과의 만남</b> · 공물·음유시인·결투·순례자. 바탕화면에서 직접 찾아옵니다.</li>
              <li><b>바탕화면</b> · 출격·귀환 비행, 성격별 행동, 수다, 계절·특별한 날 연출. 조종 모드에서 쓰다듬기·몬스터 퇴치 보상.</li>
              <li><b>레어 꾸미기</b> · 둥지 장식 4종, 업적 10개(역사 탭).</li>
              <li><b>종족 고유 스킬</b> · 12종 × 4스킬. 조종 모드·방어전·전투 창에 스킬 모션과 이펙트, 바탕화면에서 가끔 생활 스킬 연출. 드래곤 상세에서 확인(효과는 아직 연출만).</li>
              <li><b>단축키</b> · Ctrl+Alt+D 바탕화면 숨기기 · Ctrl+Alt+M 관리 창.</li>
            </ul>
            <p className="fine">본편 저장과 분리되어 있으니 마음껏 시험해 보세요. 자세한 내용은 압축 안의 테스트판_안내.txt에 있습니다.</p>
            <button className="primary" onClick={() => { setShowHelp(false); try { localStorage.setItem('bf-help-seen', '3'); } catch { /* 저장 안 돼도 괜찮음 */ } }}>시작하기</button>
          </div>
        </div>
      )}
      {s.over && <OverModal state={s} />}
    </div>
  );
}
