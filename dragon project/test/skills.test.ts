import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SPECIES_SKILLS, SKILL_IMAGES, findSkill, fxVisible } from '../src/engine/skills';
import { newState, act, SKILLS, step, newCtx } from '../src/engine/engine';
import { SPECIES } from '../src/engine/data';

const IMG = path.join(__dirname, '..', 'public', 'img');

describe('종족 고유 스킬 데이터', () => {
  it('12종 × 4슬롯, 이름이 겹치지 않는다', () => {
    expect(SPECIES_SKILLS.length).toBe(SPECIES.length);
    for (const list of SPECIES_SKILLS) {
      expect(list.map((k) => k.slot)).toEqual([0, 1, 2, 3]);
      for (const k of list) expect(k.fx.length).toBeGreaterThan(0);
    }
    const names = SPECIES_SKILLS.flat().map((k) => k.name);
    expect(new Set(names).size).toBe(48);
  });

  it('쓰는 그림이 모두 public/img 에 있다', () => {
    for (const n of SKILL_IMAGES) expect(fs.existsSync(path.join(IMG, n + '.png')), n).toBe(true);
  });

  it('이펙트 시간 구간이 0~1 안에 있다', () => {
    for (const k of SPECIES_SKILLS.flat()) for (const f of k.fx) {
      const a = f.from ?? 0.3, b = f.to ?? 0.85;
      expect(a >= 0 && b <= 1 && a < b, `${k.name} ${f.img}`).toBe(true);
    }
  });

  it('꽃시계는 하루 24시간 내내 꽃이 정확히 하나 보인다', () => {
    const flower = SPECIES_SKILLS[3][2];
    for (let h = 0; h < 24; h++) expect(flower.fx.filter((f) => fxVisible(f, h)).length).toBe(1);
  });

  it('전투 기록 문구로 스킬을 찾는다', () => {
    expect(findSkill(11, '선행 방전 · 약점 관통!')?.slot).toBe(0);
    expect(findSkill(0, '파멸의 발톱')).toBeUndefined();
  });
});

describe('실험 규칙 종족 고유 스킬', () => {
  it('켜면 전투 스킬 이름이 종족 스킬로 바뀌고, 끄면 예전 공통 스킬', () => {
    const s = newState(7);
    act(s, { type: 'start', name: '시험' });
    const d = s.dragons[0];
    expect(SKILLS(d, s)[0]).toBe('흑염 브레스');
    act(s, { type: 'rule', key: 'skills', on: true });
    expect(SKILLS(d, s)).toEqual(['흑염 낙인', '혈통 인장', '재의 기록', '파멸의 발톱']);
  });

  it('켜 둔 채 진행해도 전투가 정상적으로 끝난다', () => {
    const s = newState(11);
    act(s, { type: 'start', name: '시험' });
    act(s, { type: 'rule', key: 'skills', on: true });
    const ctx = newCtx(false);
    const d = s.dragons[0];
    act(s, { type: 'hunt', id: d.id, target: 0 });
    let saw = false;
    for (let t = 0; t < 4000 && !s.over; t += 0.5) {
      step(s, 0.5, ctx);
      if (s.battle?.skill && findSkill(s.dragons.find((x) => x.id === s.battle!.dragon)!.species, s.battle.skill)) saw = true;
    }
    expect(saw).toBe(true);
  });
});
