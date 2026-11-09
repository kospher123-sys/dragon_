import { useState } from 'react';
import type { InitData, Settings, NotifyKey } from '../../shared/types';
import { NOTIFY_LABEL } from '../../shared/types';
import { RULES, rule } from '../../engine/engine';
import type { State } from '../../engine/engine';
import { api } from '../util';

export function SettingsTab({ settings, setSettings, init, chronicle, state }: {
  settings: Settings; setSettings: (s: Settings) => void; init: InitData; chronicle: number; state?: State;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const patch = async (p: Partial<Settings>) => setSettings(await api().setSettings(p));
  return (
    <>
      <div className="heading">
        <div>
          <small>SETTINGS</small>
          <h1>설정</h1>
        </div>
      </div>
      <div className="settings">
        <section>
          <h3>성능</h3>
          <label className="radio"><input type="radio" checked={settings.perf === 'high'} onChange={() => patch({ perf: 'high' })} /> 고사양 · 60fps, 이펙트 원본 크기</label>
          <label className="radio"><input type="radio" checked={settings.perf === 'low'} onChange={() => patch({ perf: 'low' })} /> 저사양 · 30fps, 이펙트 50%, 파티클 없음</label>
          <p className="fine">바탕화면 연출에 적용됩니다.</p>
        </section>
        <section>
          <h3>알림</h3>
          {(Object.keys(NOTIFY_LABEL) as NotifyKey[]).map((k) => (
            <label key={k} className="check"><input type="checkbox" checked={settings.notify[k]} onChange={(e) => patch({ notify: { ...settings.notify, [k]: e.target.checked } })} /> {NOTIFY_LABEL[k]}</label>
          ))}
        </section>
        <section>
          <h3>바탕화면·실행</h3>
          <label className="check"><input type="checkbox" checked={settings.autoHide} onChange={(e) => patch({ autoHide: e.target.checked })} /> 전체화면 앱 실행 중 바탕화면 요소 숨기기</label>
          <label className="check"><input type="checkbox" checked={settings.hideFromCapture !== false} onChange={(e) => patch({ hideFromCapture: e.target.checked })} /> 스크린샷·화면 녹화에 바탕화면 드래곤 안 보이게 하기</label>
          <label className="check"><input type="checkbox" disabled={init.edition === 'test'} checked={settings.autoStart && init.edition !== 'test'} onChange={(e) => patch({ autoStart: e.target.checked })} /> Windows 시작 시 자동 실행{init.edition === 'test' ? ' (테스트판에서는 꺼져 있습니다)' : ''}</label>
          <label className="field">표시 모니터
            <select value={settings.monitor} onChange={(e) => patch({ monitor: Number(e.target.value) })}>
              {init.monitors.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="field">바탕화면 말풍선
            <select value={settings.chatter ?? 'normal'} onChange={(e) => patch({ chatter: e.target.value as Settings['chatter'] })}>
              <option value="many">많이 (수다쟁이)</option>
              <option value="normal">보통</option>
              <option value="few">적게 (사건 소식만)</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={settings.season !== false} onChange={(e) => patch({ season: e.target.checked })} /> 계절 연출 (겨울 눈 · 봄 꽃잎 · 여름밤 반딧불 · 가을 낙엽, 고사양에서만)</label>
          <label className="check"><input type="checkbox" checked={settings.hiddenAll} onChange={(e) => patch({ hiddenAll: e.target.checked })} /> 바탕화면 드래곤 모두 숨기기</label>
          <p className="fine">단축키 <code>Ctrl + Alt + D</code>로 언제든 숨기기/보이기를 바꿀 수 있습니다. 드래곤에 마우스를 올리면 이름표가 뜨고, 밤 11시~아침 6시에는 둥지에서 자는 일이 많아집니다.</p>
        </section>
        {init.features && state && (
          <section>
            <h3>실험 규칙</h3>
            {RULES.map(([k, name, desc]) => (
              <div key={k} className="rule-item">
                <label className="check"><input type="checkbox" checked={rule(state, k)} onChange={(e) => api().act({ type: 'rule', key: k, on: e.target.checked })} /> <b>{name}</b></label>
                <p className="fine">{desc}</p>
              </div>
            ))}
            <p className="fine">기존 규칙의 문제(습격 때 수호자 사망, 큰 레어의 유물 과잉, 전투 줄서기)를 고쳐 보는 규칙입니다. 끄면 원래 규칙으로 돌아갑니다.</p>
          </section>
        )}
        <section>
          <h3>저장</h3>
          <p className="fine">자동 저장 위치: <code>{init.savePath}</code><br />30초마다, 중요한 사건 직후, 종료할 때 저장합니다. 직전 저장본은 world.backup.json으로 남습니다.</p>
          <div className="row">
            <button onClick={async () => { const p = await api().exportSave(); setMsg(p ? `내보냈습니다: ${p}` : null); }}>저장 내보내기</button>
            <button onClick={async () => { const e = await api().importSave(); setMsg(e ?? '불러왔습니다. 이전 연대기는 보관했습니다.'); }}>저장 파일 불러오기</button>
          </div>
          <p className="fine">웹 버전에서 내보낸 JSON도 불러올 수 있습니다. 시간 값은 이 버전 속도에 맞춰 바뀝니다.</p>
          {msg && <p className="muted">{msg}</p>}
        </section>
        <section>
          <h3>연대기</h3>
          <div className="row">
            <button className="danger" onClick={async () => { if (confirm(`${chronicle}번째 연대기를 보관하고 새 연대기를 시작할까요?`)) await api().newChronicle(); }}>새 연대기 시작</button>
            <button onClick={() => api().quit()}>저장하고 종료</button>
          </div>
          {init.edition === 'test' && (
            <div className="row">
              <button onClick={async () => { if (confirm('지금 테스트 연대기를 보관하고, 본편 저장을 다시 복사해 시작할까요? (본편은 그대로)')) setMsg((await api().reseed()) ?? '본편 저장을 다시 복사했습니다.'); }}>본편에서 다시 복사해 시작</button>
            </div>
          )}
          <p className="fine">관리 창을 닫아도 게임은 트레이에서 계속 진행됩니다. 완전히 끄려면 ‘저장하고 종료’를 누르세요.</p>
        </section>
      </div>
    </>
  );
}
