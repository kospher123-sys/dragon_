import type { Settings } from '../../shared/types';
import { useEffect, useState } from 'react';
import type { State, Dragon } from '../../engine/engine';
import {
  isAdult, canTrain, canAwaken, trainCost, trainCount, trainSlots, awakenCost, awakenLevel, travelTime, titleOf,
  autoMaxRisk, guardian, personalityOf, PERSONALITY_DESC, TRAIN_LABEL, WING_MAX, AWAKEN_MAX_GRADE, type TrainStat,
} from '../../engine/engine';
import { SPECIES, GRADES, GRADE_COLOR, T, REGIONS, RATE } from '../../engine/data';
import { api, dur, lairName, status, stage, clock } from '../util';
import { Portrait } from './Portrait';
import { skillsOf, SLOTS } from '../../engine/skills';
import { rule } from '../../engine/engine';

const NAME_A = ['칼', '아르', '벨', '모르', '세', '바', '이그', '루', '카', '네', '오', '자르', '헤', '드라'];
const NAME_B = ['가', '노', '리', '시', '라', '토', '베', '니', '로', '스', '키', '란', '드', '르'];
const NAME_C = ['스', '크', '온', '안', '렌', '돈', '그', '르', '스트', '모스', '리온', '바르'];
const randomName = () => {
  const p = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  return p(NAME_A) + p(NAME_B) + (Math.random() < 0.7 ? p(NAME_C) : '');
};

export function DetailTab({ state, d, settings, setSettings }: { state: State; d: Dragon; settings?: Settings; setSettings?: (s: Settings) => void }) {
  const [name, setName] = useState(d.name);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setName(d.name); setMsg(null); }, [d.id]);
  const parent = d.parent ? state.dragons.find((x) => x.id === d.parent) : undefined;
  const children = state.dragons.filter((x) => x.parent === d.id);
  const st = status(state, d);
  const log = state.events.filter((e) => e.text.includes(d.name)).slice(0, 30);

  const run = async (a: Parameters<ReturnType<typeof api>['act']>[0], ok: string) => {
    const err = await api().act(a);
    setGrowMsg(err ?? ok);
  };
  const [growMsg, setGrowMsg] = useState<string | null>(null);
  useEffect(() => setGrowMsg(null), [d.id]);
  const title = titleOf(d);
  const tr = d.train ?? { power: 0, scale: 0, wing: 0 };
  const mine = !d.dead && d.home === 0;
  const isGuardian = guardian(state)?.id === d.id;

  const rename = async () => {
    const err = await api().act({ type: 'rename', id: d.id, name });
    setMsg(err ?? '이름을 바꿨습니다.');
  };

  return (
    <>
      <div className="heading">
        <div>
          <small>GROWTH RECORD{title ? ` · ${title}` : ''}</small>
          <h1 style={{ color: GRADE_COLOR[d.grade] }}>{d.grade === 4 ? '♛ ' : ''}{d.name}</h1>
        </div>
        <span className="muted">{SPECIES[d.species]}{d.second !== undefined ? ' × ' + SPECIES[d.second] : ''} · {GRADES[d.grade]} · {d.generation}세대</span>
      </div>
      <div className="detail">
        <div className="detail-art"><Portrait d={d} size={260} /></div>
        <div className="detail-body">
          <table className="kv">
            <tbody>
              <tr><th>상태</th><td className={'tone-' + st.tone}>{st.text}{st.left !== undefined ? ` · ${dur(st.left)} 남음` : ''}</td></tr>
              <tr><th>거처</th><td>{lairName(d.home)}</td></tr>
              <tr><th>단계</th><td>{stage(d)}{!isAdult(d) && !d.dead ? ` · 성체 조건: 활동 ${dur(T.ADULT_AGE)} + Lv.3 (현재 ${dur(d.age)}, Lv.${d.level})` : ''}</td></tr>
              <tr><th>레벨</th><td>Lv.{d.level} · 경험치 {Math.floor(d.xp)} / {d.level * 100}{!d.dead && <span className="muted"> · 쉬기만 하면 약 {dur((d.level * 100 - d.xp) / RATE.XP)}, 사냥 승리 한 번에 100~320</span>}</td></tr>
              <tr><th>생명력</th><td>{Math.max(0, Math.round(d.hp))} / {d.max}</td></tr>
              <tr><th>공격력</th><td>{d.power}</td></tr>
              <tr><th>기력</th><td>{Math.floor(d.energy)} / 100</td></tr>
              <tr><th>부상</th><td>{d.injury > 1 ? `부상 ${d.injury.toFixed(1)} (공격력 −${Math.round(Math.min(0.4, d.injury * 0.04) * 100)}%)` : '안정'}</td></tr>
              <tr><th>혈통</th><td>{parent ? `부모 ${parent.name}` : '태초의 혈통'}{children.length ? ` · 자식 ${children.length}` : ''}</td></tr>
              <tr><th>성격</th><td>{personalityOf(d.id)} · <span className="muted">{PERSONALITY_DESC[personalityOf(d.id)]}</span></td></tr>
              <tr><th>전적</th><td>승리 {d.wins ?? 0}회{title ? ` · ‘${title}’` : ''}{d.awakened ? ` · 각성 ${d.awakened}회` : ''}</td></tr>
              <tr><th>산란</th><td>{d.laid} / 3</td></tr>
              <tr><th>태어난 때</th><td>{clock(d.born)}{d.dead && d.diedAt !== undefined ? ` · 세상을 떠난 때 ${clock(d.diedAt)}` : ''}</td></tr>
            </tbody>
          </table>
          {!d.dead && (
            <div className="rename">
              <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} aria-label="이름" />
              <button className="link" title="무작위 이름" onClick={() => setName(randomName())}>🎲</button>
              <button onClick={rename} disabled={!name.trim() || name === d.name}>이름 바꾸기</button>
              {settings && setSettings && (() => {
                const on = settings.desktop[d.id] ?? d.home === 0;
                return <button onClick={async () => setSettings(await api().setSettings({ desktop: { ...settings.desktop, [d.id]: !on } }))}>{on ? '바탕화면에서 빼기' : '바탕화면에 부르기'}</button>;
              })()}
              {msg && <span className="muted">{msg}</span>}
            </div>
          )}
        </div>
      </div>
      {mine && (
        <section className="grow">
          <h3>성장 <small className="muted">· 고대 유물 {state.resources}</small></h3>
          <div className="grow-grid">
            <div className="grow-card">
              <h4>수련 <small className="muted">{trainCount(d)} / {trainSlots(d)} · 레벨당 1회</small></h4>
              <p className="fine">근력 {tr.power} · 비늘 {tr.scale} · 날개 {tr.wing}/{WING_MAX} · 다음 비용 유물 {trainCost(d)}</p>
              <div className="row">
                {(['power', 'scale', 'wing'] as TrainStat[]).map((k) => {
                  const why = canTrain(state, d, k);
                  return (
                    <button key={k} title={why ?? ''} disabled={!!why} onClick={() => run({ type: 'train', id: d.id, stat: k }, `${TRAIN_LABEL[k]} 수련 완료`)}>
                      {TRAIN_LABEL[k]} {k === 'power' ? '공격 +6' : k === 'scale' ? '생명 +40' : '이동 −6%'}
                    </button>
                  );
                })}
              </div>
              <p className="fine">편도 이동 {Math.round(travelTime(d) / 60)}분 · 추천: {
                d.auto !== undefined && tr.wing < WING_MAX ? '날개 (자동 사냥이 잦으면 이동 시간이 줄어 이득)'
                  : d.max < d.power * 12 ? '비늘 (공격력에 비해 생명력이 낮음)'
                  : '근력 (전투를 빨리 끝내 피해를 줄임)'
              }</p>
            </div>
            <div className="grow-card">
              <h4>각성 <small className="muted">등급 승급</small></h4>
              {d.grade >= AWAKEN_MAX_GRADE ? (
                <p className="fine">{d.grade === 4 ? '패왕은 각성의 끝입니다.' : '군주 등급에 이르렀습니다. 패왕은 타고나야 합니다.'}</p>
              ) : (
                <>
                  <p className="fine">{GRADES[d.grade]} → <b style={{ color: GRADE_COLOR[d.grade + 1] }}>{GRADES[d.grade + 1]}</b> · Lv.{awakenLevel(d)} 이상 · 유물 {awakenCost(d)}<br />생명력·공격력이 등급 배율만큼 커지고 부상이 낫습니다.</p>
                  <button className="primary" disabled={!!canAwaken(state, d)} title={canAwaken(state, d) ?? ''} onClick={() => run({ type: 'awaken', id: d.id }, '각성했습니다!')}>각성하기</button>
                  {canAwaken(state, d) && <span className="fine"> {canAwaken(state, d)}</span>}
                </>
              )}
            </div>
            <div className="grow-card">
              <h4>자동 사냥</h4>
              <select value={d.auto === undefined ? 'off' : String(d.auto)} onChange={(e) => {
                const v = e.target.value;
                run({ type: 'auto', id: d.id, region: v === 'off' ? null : Number(v) }, v === 'off' ? '자동 사냥을 껐습니다' : '자동 사냥을 켰습니다');
              }}>
                <option value="off">끄기</option>
                <option value="-1">알아서 (위험도 {autoMaxRisk(d)}까지)</option>
                {REGIONS.map((r, i) => <option key={i} value={i}>{r.name} · 위험도 {r.risk}</option>)}
              </select>
              <p className="fine">생명력 70%·기력 50 이상으로 회복되면 스스로 출발합니다. 레어 습격 중에는 나가지 않습니다.{isGuardian ? ' ⚠ 수호 흑염룡이 자리를 비우면 레어가 습격받을 수 있어요.' : ''}</p>
            </div>
          </div>
          {growMsg && <p className="muted">{growMsg}</p>}
        </section>
      )}
      <section className="skills">
        <h3>고유 스킬 <small className="muted">· {SPECIES[d.species]}{rule(state, 'skills') ? '' : ' · 실험 규칙 ‘종족 고유 스킬’이 꺼져 있어 공통 스킬을 씁니다'}</small></h3>
        <div className="skill-grid">
          {skillsOf(d.species).map((k) => (
            <div key={k.slot} className="skill-card">
              <div
                className="skill-art"
                style={{
                  backgroundImage: `url(bf://img/sk-motion-${String(k.species).padStart(2, '0')}.png)`,
                  backgroundSize: '300% 400%',
                  backgroundPosition: `50% ${(k.slot / 3) * 100}%`,
                }}
              />
              <div>
                <h4>{k.name} <span className={'slot slot-' + k.slot}>{SLOTS[k.slot]}</span></h4>
                <p className="fine">{k.desc}</p>
                {k.solo && <p className="fine"><b>혼자일 때</b> {k.solo}</p>}
                <p className="fine">{k.kind} · 바탕화면: {k.desk}{k.implemented ? (k.solo ? ' · 혼자 판본 효과 적용(아군 판본은 다음 단계)' : '') : ' · 효과는 아직 없음(연출만)'}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <h3>성장 기록</h3>
      <ul className="events">
        {log.map((e, i) => <li key={i}><time>{clock(e.time)}</time>{e.text}</li>)}
        {!log.length && <li className="muted">아직 기록이 없습니다.</li>}
      </ul>
    </>
  );
}
