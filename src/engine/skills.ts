// 종족 고유 스킬 48개 (12종 × 공격·방어·생활·궁극기).
// 기획 원본: Notion '흑염룡 드래곤 스킬 기획' (2026-11-07 확정본, 검토 교체안 미반영).
//
// 이번 단계(스킬 이미지 적용판)에서 구현한 것
//   - 이름·분류·설명, 바탕화면 조종 모드/방어전 시전 연출, 생활 스킬 바탕화면 연출, 전투 창 연출, 관리 창 표시
//   - 전투에서 공격 범위(전체/단일)만 스킬별로 다르다. 피해 계산은 기존 공통 스킬과 같다.
// 아직 구현하지 않은 것: 스킬별 고유 효과(버프·보호막·스택·조건 발동·커서 판정 등). implemented 가 false 인 이유.
//
// 그림: public/img/sk-motion-NN.png (3열 준비·발동·회수 × 4행 슬롯), sk-NN-MM.png (정리본 번호 MM 이펙트)
//       tools/build_skill_assets.py 로 만든다.

export const SLOTS = ['공격', '방어', '생활', '궁극기'] as const;
export type Slot = 0 | 1 | 2 | 3;

/**
 * 이펙트 위치
 * - target / targetGround : 대상 중심 / 대상 발밑
 * - self / selfGround     : 시전자 몸 중심 / 발밑
 * - front / frontGround   : 시전자 앞 (바라보는 쪽)
 * - mid / midGround       : 시전자와 대상 사이
 * - beam                  : 입에서 대상까지 늘어나는 광선 (그림 왼쪽이 시작점)
 * - projectile            : 입에서 대상으로 날아감 (그림이 오른쪽을 향함)
 * - sky                   : 하늘에서 대상으로 떨어짐
 * - rise                  : 시전자 뒤에서 솟아오름
 */
export type FxAt = 'target' | 'targetGround' | 'self' | 'selfGround' | 'front' | 'frontGround' | 'mid' | 'midGround' | 'beam' | 'projectile' | 'sky' | 'rise';

export interface Fx {
  /** 그림 이름 (bf://img/<img>.png) */
  img: string;
  at: FxAt;
  /** 그릴 너비(px, 드래곤 너비 170 기준). 높이는 그림 비율 */
  w: number;
  /** 시전 시간 중 보이는 구간 (0~1) */
  from?: number;
  to?: number;
  /** 복제 수 (나란히/흩어져) */
  n?: number;
  /** 위아래 보정(px, 위가 −) */
  dy?: number;
  /** 실제 시각(시) 구간 [시작, 끝) — 꽃시계처럼 시각에 따라 다른 그림 */
  hours?: [number, number];
  /** 밝게 겹치기 (빛·불꽃 계열) */
  glow?: boolean;
}

export interface SkillDef {
  species: number;
  slot: Slot;
  name: string;
  /** 작동 방식 (기획 분류) */
  kind: string;
  /** 바탕화면 요소 (기획) */
  desk: string;
  desc: string;
  /** 전투에서 적 전체를 나눠 치는지 (false 면 무작위 1명) */
  area: boolean;
  fx: Fx[];
  /** 고유 효과까지 구현됐는지 */
  implemented: boolean;
}

const im = (sp: number, n: number) => `sk-${String(sp).padStart(2, '0')}-${String(n).padStart(2, '0')}`;

type Row = [name: string, kind: string, desk: string, desc: string, area: boolean, fx: Fx[]];

const DATA: Row[][] = [
  // 0 흑염룡
  [
    ['흑염 낙인', '연계', '조종 모드 퇴치 연동', '조종 모드로 쫓아낸 몬스터 종류에 낙인을 새긴다. 같은 종류와 다시 싸우면 첫 공격 ×1.5, 적 사기 −10', false,
      [{ img: im(0, 4), at: 'target', w: 110, from: 0.3, to: 0.9, glow: true }, { img: im(0, 5), at: 'target', w: 130, from: 0.45, to: 0.8, glow: true }]],
    ['혈통 인장', '설치', '작업 표시줄 끝', '작업 표시줄 한쪽 끝에 혈통 인장을 새긴다. 방어전에서 그쪽으로 오는 침입이 50% → 20%', false,
      [{ img: im(0, 7), at: 'selfGround', w: 230, from: 0.2, to: 0.95, glow: true }, { img: im(0, 8), at: 'selfGround', w: 300, from: 0.45, to: 0.8, glow: true }]],
    ['잿불 묻기', '조건부', '앱이 꺼져 있던 실제 시간', '앱이 꺼져 있던 실제 시간으로 둥지 불씨 상태가 정해지고, 첫 쓰다듬기에 레어 드래곤 기력을 회복한다', false,
      [{ img: im(0, 11), at: 'frontGround', w: 180, from: 0.15, to: 1 }, { img: im(0, 12), at: 'frontGround', w: 150, from: 0.5, to: 1, glow: true }]],
    ['재의 기록', '소환', '없음', '수호자 생명력 30% 이하에서 전사한 선대의 잿더미로 그림자를 불러낸다(공격력 50%)', true,
      [{ img: im(0, 14), at: 'rise', w: 150, from: 0.15, to: 0.6 }, { img: im(0, 15), at: 'mid', w: 220, from: 0.35, to: 0.8, dy: -30 }, { img: im(0, 16), at: 'target', w: 200, from: 0.7, to: 1 }]],
  ],
  // 1 레드
  [
    ['열 관성', '지속', '실제 시간 냉각', '행동할수록 열이 쌓여 배율이 오르고, 실제 시간이 지나면 식는다', false,
      [{ img: im(1, 2), at: 'self', w: 90, from: 0.15, to: 0.75, glow: true, dy: -30 }, { img: im(1, 3), at: 'self', w: 90, from: 0.65, to: 1, dy: -50 }]],
    ['맞불', '조건부', '없음', '적이 큰 공격을 예고하면 먼저 지면을 태워 그 피해를 −70% (대가로 1턴 공격 불가)', false,
      [{ img: im(1, 5), at: 'midGround', w: 260, from: 0.25, to: 0.75, glow: true }, { img: im(1, 6), at: 'midGround', w: 260, from: 0.6, to: 1 }]],
    ['구들돌', '설치', '작업 표시줄 · 커서 · 실제 시간', '작업 표시줄에 데운 돌을 놓는다. 6시간에 걸쳐 식고, 커서를 올려 온기를 확인한다', false,
      [{ img: im(1, 8), at: 'frontGround', w: 120, from: 0.3, to: 0.8 }, { img: im(1, 9), at: 'frontGround', w: 120, from: 0.75, to: 1 }]],
    ['가마 소성', '변신', '없음', '아군 평균 생명력 50% 이하에서 날개로 몸을 감싸 3턴 동안 가마가 된다', true,
      [{ img: im(1, 12), at: 'selfGround', w: 260, from: 0.3, to: 1, glow: true }]],
  ],
  // 2 블루
  [
    ['거품 그물', '연계', '커서로 원 그리기', '커서로 원을 그리면 거품이 1~3겹 감기고, 아군이 공격하면 터진다', false,
      [{ img: im(2, 2), at: 'target', w: 140, from: 0.25, to: 0.7 }, { img: im(2, 3), at: 'targetGround', w: 170, from: 0.6, to: 1, glow: true }]],
    ['물그림자', '소환', '작업 표시줄 위 수면', '작업 표시줄 위 수면에서 물그림자 분신이 나와 적의 단일 공격을 2회 대신 맞는다', false,
      [{ img: im(2, 5), at: 'frontGround', w: 170, from: 0.3, to: 1 }]],
    ['물때', '지속', '실제 시각 · 화면 하단 띠', '실제 조석 주기(12시간 25분)에 따라 물이 차고 빠지며, 간조 때 조개와 물웅덩이가 드러난다', false,
      [{ img: im(2, 7), at: 'selfGround', w: 340, from: 0.15, to: 1 }, { img: im(2, 9), at: 'frontGround', w: 120, from: 0.45, to: 1 }, { img: im(2, 8), at: 'frontGround', w: 60, from: 0.6, to: 1, dy: -4 }]],
    ['발묵', '변신', '화면 하단 띠', '아군 둘이 위험하면 몸을 물로 풀어 화면 하단을 먹물처럼 번지게 하는 3턴 변신', true,
      [{ img: im(2, 11), at: 'midGround', w: 360, from: 0.25, to: 0.85 }, { img: im(2, 12), at: 'self', w: 170, from: 0.7, to: 1 }]],
  ],
  // 3 에메랄드
  [
    ['접순', '연계', '없음', '아군이 공격한 직후 그 자리에 접순이 붙어 3턴 동안 자라고 열매를 맺는다', false,
      [{ img: im(3, 2), at: 'projectile', w: 110, from: 0.25, to: 0.55 }, { img: im(3, 3), at: 'target', w: 100, from: 0.55, to: 1 }]],
    ['덩굴 울타리', '설치', '작업 표시줄 · 앱 켜진 시간', '작업 표시줄에 덩굴 울타리를 세운다. 앱이 켜져 있는 시간만큼 자란다', false,
      [{ img: im(3, 5), at: 'midGround', w: 280, from: 0.25, to: 1 }]],
    ['꽃시계', '지속', '실제 시각', '실제 시각 네 구간마다 다른 꽃이 핀다(나팔꽃·민들레·분꽃·달맞이꽃). 구간마다 쓰다듬기 1회', false,
      [
        { img: im(3, 7), at: 'frontGround', w: 70, from: 0.3, to: 1, hours: [5, 10] },
        { img: im(3, 8), at: 'frontGround', w: 70, from: 0.3, to: 1, hours: [10, 16] },
        { img: im(3, 9), at: 'frontGround', w: 70, from: 0.3, to: 1, hours: [16, 21] },
        { img: im(3, 10), at: 'frontGround', w: 70, from: 0.3, to: 1, hours: [21, 5] },
      ]],
    ['휘묻이 숲', '소환', '없음', '생명력 40% 이하에서 휘묻이로 묘목 숲을 3턴 동안 불러내 적을 뿌리로 묶는다', true,
      [{ img: im(3, 12), at: 'midGround', w: 80, n: 3, from: 0.25, to: 1 }, { img: im(3, 13), at: 'targetGround', w: 130, from: 0.5, to: 1 }]],
  ],
  // 4 백은
  [
    ['회전 등명', '지속', '없음', '미리 보이는 순서로 4턴 동안 적을 하나씩 비춰 회피를 무효로 한다', false,
      [{ img: im(4, 2), at: 'beam', w: 0, from: 0.25, to: 0.7, glow: true }, { img: im(4, 3), at: 'target', w: 110, from: 0.5, to: 0.9, glow: true }]],
    ['안개 막', '설치', '없음', '대열 앞에 안개 막을 친다. 적의 단일 공격이 가짜 실루엣을 포함해 무작위로 향한다', false,
      [{ img: im(4, 5), at: 'midGround', w: 220, from: 0.25, to: 1 }, { img: im(4, 6), at: 'midGround', w: 150, from: 0.45, to: 1, dy: -6 }]],
    ['귀환 등대', '조건부', '화면 가장자리 · 커서', '귀환 비행 때 화면 가장자리에 빛줄기가 뜨고, 8초 안에 커서를 올리면 보상', false,
      [{ img: im(4, 8), at: 'rise', w: 160, from: 0.25, to: 0.85, glow: true }, { img: im(4, 9), at: 'front', w: 170, from: 0.45, to: 1, glow: true, dy: -40 }]],
    ['브로켄 강림', '변신', '없음', '3턴 이후 안개 위에 거인 그림자를 투영해 3턴 동안 적 공격을 끌어 피해 −60%', true,
      [{ img: im(4, 12), at: 'rise', w: 200, from: 0.2, to: 1, glow: true, dy: -40 }, { img: im(4, 11), at: 'rise', w: 300, from: 0.3, to: 1, dy: -10 }]],
  ],
  // 5 루비
  [
    ['성채', '조건부', '없음', '맞을 때마다 결정이 쌓이고, 3개가 되면 다음 공격이 여섯 줄기 별빛으로 갈라진다', true,
      [{ img: im(5, 2), at: 'front', w: 90, from: 0.15, to: 0.5, glow: true, dy: -40 }, { img: im(5, 3), at: 'beam', w: 0, from: 0.35, to: 0.85, glow: true }]],
    ['패싯 전반사', '지속', '없음', '3턴 동안 같은 적의 재공격 피해 −50%, 25%를 되튕긴다', false,
      [{ img: im(5, 5), at: 'self', w: 150, from: 0.2, to: 0.9, glow: true }, { img: im(5, 6), at: 'target', w: 140, from: 0.5, to: 0.9, glow: true }]],
    ['광채 분산', '즉발', '커서 · 화면 가장자리', '커서를 광원 삼아 거울 대칭 자리에 반짝임을 뿌린다. 밟은 드래곤은 기력 회복', false,
      [{ img: im(5, 8), at: 'frontGround', w: 300, from: 0.3, to: 1, glow: true, dy: -30 }]],
    ['루비 발진', '연계', '방어전 화면 양 끝 · 하단 띠', '아군 공격으로 펌핑 게이지를 채워, 빛을 3번 왕복 증폭시켜 쏘는 레이저', true,
      [{ img: im(5, 11), at: 'front', w: 120, from: 0.15, to: 0.55, glow: true, dy: -40 }, { img: im(5, 10), at: 'mid', w: 45, from: 0.2, to: 0.85, dy: -20 }, { img: im(5, 12), at: 'beam', w: 0, from: 0.45, to: 0.9, glow: true }]],
  ],
  // 6 호박
  [
    ['호박 봉입', '즉발', '없음', '적 1명을 2턴 동안 호박에 가두고, 그동안 받은 피해를 모았다가 ×1.4로 한꺼번에 준다', false,
      [{ img: im(6, 2), at: 'projectile', w: 110, from: 0.2, to: 0.45, glow: true }, { img: im(6, 3), at: 'target', w: 80, from: 0.45, to: 0.8 }, { img: im(6, 4), at: 'target', w: 150, from: 0.75, to: 1, glow: true }]],
    ['밀랍 봉개', '설치', '없음', '밀랍 인장에 생명력을 기록해 두고, 3턴 안에 25%p 이상 줄면 되돌린다', false,
      [{ img: im(6, 6), at: 'self', w: 100, from: 0.2, to: 0.7, glow: true, dy: -30 }, { img: im(6, 7), at: 'self', w: 120, from: 0.6, to: 1, glow: true }]],
    ['8자 춤', '연계', '작업 표시줄 · 커서 · 화면 가장자리', '작업 표시줄에서 8자 춤을 추면 그 뜻을 읽어 맞는 화면 가장자리로 커서를 옮긴다. 다음 자동 사냥 강화', false,
      [{ img: im(6, 10), at: 'self', w: 220, from: 0.2, to: 1, glow: true, dy: -60 }]],
    ['분봉', '소환', '없음', '봉입이 크게 깨지면 대상으로 지정할 수 없는 불벌 떼 3무리를 부른다', true,
      [{ img: im(6, 12), at: 'projectile', w: 140, n: 3, from: 0.3, to: 0.95, glow: true }]],
  ],
  // 7 화산
  [
    ['내리막 화쇄류', '즉발', '없음', '고른 적에서 생명력 비율이 더 낮은 적으로만 최대 3번 흘러가는 피해', true,
      [{ img: im(7, 2), at: 'targetGround', w: 280, from: 0.3, to: 1 }]],
    ['용암 동굴', '설치', '없음', '아군을 용암 동굴에 2턴 숨긴다(공격 불가 · 회복)', false,
      [{ img: im(7, 4), at: 'selfGround', w: 240, from: 0.25, to: 1 }, { img: im(7, 5), at: 'frontGround', w: 110, from: 0.7, to: 1, glow: true }]],
    ['간헐천 예보', '조건부', '실제 시간 · 조종 모드 클릭', '직전 증기 분출 길이로 다음 분출을 예고한다. 미리 레어 드래곤을 불러 두면 보상', false,
      [{ img: im(7, 7), at: 'rise', w: 80, from: 0.3, to: 1 }]],
    ['분화 경보', '지속', '방어전 하단 띠', '4턴에 걸쳐 경보가 초록 → 노랑 → 주황 → 빨강으로 오르고, 빨강에서 ×2.2. 크게 맞으면 단계가 멈춘다', true,
      [
        { img: im(7, 9), at: 'selfGround', w: 220, from: 0.1, to: 0.35 },
        { img: im(7, 10), at: 'self', w: 220, from: 0.3, to: 0.55 },
        { img: im(7, 11), at: 'sky', w: 70, n: 3, from: 0.45, to: 0.75 },
        { img: im(7, 12), at: 'targetGround', w: 200, from: 0.7, to: 1, glow: true },
      ]],
  ],
  // 8 흑요석
  [
    ['정밀 절제', '즉발', '없음', '적의 이로운 효과를 최대 2개 잘라 내고 추가 피해', false,
      [{ img: im(8, 2), at: 'beam', w: 0, from: 0.3, to: 0.65, glow: true }, { img: im(8, 3), at: 'target', w: 120, from: 0.5, to: 1 }]],
    ['루퍼트의 눈물', '지속', '없음', '3턴 동안 단일 공격 피해 −80%. 범위 공격을 맞으면 산산조각 나며 파편으로 반격', false,
      [{ img: im(8, 5), at: 'self', w: 200, from: 0.2, to: 0.8 }, { img: im(8, 6), at: 'self', w: 220, from: 0.75, to: 1, glow: true }]],
    ['정밀 봉합', '조건부', '커서', '부상 드래곤이 있을 때 점 6개를 8초 안에 순서대로 이으면 부상 시간 −25%', false,
      [{ img: im(8, 8), at: 'self', w: 200, from: 0.25, to: 0.85, glow: true, dy: -70 }, { img: im(8, 9), at: 'self', w: 90, from: 0.75, to: 1, glow: true, dy: -70 }]],
    ['능선 박리', '연계', '방어전 커서 한 획', '같은 적을 잇달아 치는 아군마다 배율이 쌓이는 돌날 연속 공격', true,
      [{ img: im(8, 11), at: 'projectile', w: 150, from: 0.2, to: 0.5, glow: true }, { img: im(8, 12), at: 'beam', w: 0, from: 0.45, to: 0.9, glow: true }]],
  ],
  // 9 황금
  [
    ['금화 대출', '지속', '없음', '적에게 2턴 동안 공격 +15%를 빌려주고, 그동안 적이 준 피해를 장부에 적어 만기에 상환 피해를 준다', false,
      [{ img: im(9, 2), at: 'target', w: 150, from: 0.25, to: 0.75, glow: true }, { img: im(9, 3), at: 'sky', w: 120, from: 0.65, to: 1, glow: true }]],
    ['금박 펴기', '즉발', '없음', '황금 생명력 40% 만큼의 금박 보호막을 1~4명에게 나눠 준다', false,
      [{ img: im(9, 5), at: 'self', w: 200, from: 0.25, to: 0.8, glow: true }, { img: im(9, 6), at: 'self', w: 220, from: 0.75, to: 1, glow: true }]],
    ['사금 일기', '조건부', '작업 표시줄 · 커서', '20분마다 사금 접시가 놓이고, 커서를 일정한 리듬으로 흔들면 사금이 나온다', false,
      [{ img: im(9, 8), at: 'frontGround', w: 130, from: 0.25, to: 1 }, { img: im(9, 9), at: 'front', w: 40, from: 0.6, to: 1, glow: true, dy: -30 }]],
    ['내림 경매', '설치', '방어전 화면 하단 중앙 · 클릭', '낙찰가는 내려가고 적이 먼저 가로챌 확률은 오르는 경매. 낙찰하면 적의 강화를 몰수', true,
      [{ img: im(9, 11), at: 'midGround', w: 120, from: 0.2, to: 0.85 }, { img: im(9, 12), at: 'self', w: 70, from: 0.6, to: 1, glow: true, dy: -90 }, { img: im(9, 3), at: 'sky', w: 120, from: 0.6, to: 1, glow: true }]],
  ],
  // 10 서리
  [
    ['눈사태 유도', '즉발', '없음', '마지막으로 쓴 뒤 지난 턴 수만큼 눈이 쌓여 강해지는 눈사태', true,
      [{ img: im(10, 2), at: 'targetGround', w: 180, from: 0.15, to: 0.5, dy: -50 }, { img: im(10, 3), at: 'targetGround', w: 300, from: 0.45, to: 1 }]],
    ['허들 순환', '지속', '없음', '4턴 동안 안쪽 자리 피해 −50%. 가장 약한 아군이 자동으로 안쪽으로 순환한다', false,
      [{ img: im(10, 5), at: 'selfGround', w: 260, from: 0.2, to: 1 }]],
    ['눈송이 받기', '조건부', '실제 시각 · 하단 띠 · 커서', '밤이나 겨울 연출 때 하단에 떨어지는 큰 눈송이를 커서로 받아 24종 도감을 채운다', false,
      [{ img: im(10, 7), at: 'front', w: 50, from: 0.2, to: 0.7, dy: -60 }, { img: im(10, 8), at: 'front', w: 80, from: 0.65, to: 1, glow: true, dy: -40 }]],
    ['얼어붙은 시간', '변신', '방어전', '조건 없이 스스로 3턴 동안 얼음 속에 시간을 멈춘다. 적이 움직일수록 서리층이 쌓인다', true,
      [{ img: im(10, 11), at: 'selfGround', w: 230, from: 0.15, to: 1, glow: true }, { img: im(10, 10), at: 'selfGround', w: 230, from: 0.3, to: 1 }, { img: im(10, 12), at: 'targetGround', w: 140, from: 0.5, to: 1 }]],
  ],
  // 11 폭풍
  [
    ['선행 방전', '즉발', '없음', '대상을 고르지 않고, 공격력이 가장 높은 적에게 ×1.8 낙뢰', false,
      [{ img: im(11, 2), at: 'sky', w: 70, from: 0.35, to: 0.75, glow: true }]],
    ['회로 차단기', '조건부', '없음', '아군이 한 번에 30% 넘게 맞으면 30%에서 잘라 낸다(대가로 다음 행동 1번 건너뜀)', false,
      [{ img: im(11, 4), at: 'self', w: 200, from: 0.25, to: 1, glow: true }]],
    ['섬광과 천둥', '연계', '하단 띠 · 커서', '15~30분마다 하단에 섬광이 치고, 천둥 전에 커서를 올리면 포착(가까울수록 보상 큼)', false,
      [{ img: im(11, 6), at: 'frontGround', w: 30, from: 0.2, to: 0.4, glow: true, dy: -40 }, { img: im(11, 8), at: 'frontGround', w: 220, from: 0.45, to: 0.9, glow: true }, { img: im(11, 7), at: 'front', w: 150, from: 0.6, to: 1, glow: true, dy: -50 }]],
    ['구전', '소환', '방어전 화면 가장자리', '조종할 수 없는 구전 3개가 적(75%)·아군(25%)에게 무작위로 튄다', true,
      [{ img: im(11, 10), at: 'projectile', w: 60, n: 3, from: 0.25, to: 0.7, glow: true }, { img: im(11, 11), at: 'target', w: 160, from: 0.65, to: 1, glow: true }]],
  ],
];

export const SPECIES_SKILLS: SkillDef[][] = DATA.map((rows, species) =>
  rows.map(([name, kind, desk, desc, area, fx], slot) => ({ species, slot: slot as Slot, name, kind, desk, desc, area, fx, implemented: false })),
);

export const skillsOf = (species: number): SkillDef[] => SPECIES_SKILLS[species] ?? SPECIES_SKILLS[0];

/** 이름으로 스킬 찾기 (전투 기록의 b.skill 은 '이름 · 약점 관통!' 처럼 덧붙을 수 있다) */
export function findSkill(species: number, text: string): SkillDef | undefined {
  return skillsOf(species).find((k) => text === k.name || text.startsWith(k.name + ' '));
}

/** 이 시각(시)에 보이는 이펙트인가 */
export function fxVisible(f: Fx, hour: number): boolean {
  if (!f.hours) return true;
  const [a, b] = f.hours;
  return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
}

/** 스킬 그림 목록 (미리 불러오기용) */
export const SKILL_IMAGES: string[] = [
  ...SPECIES_SKILLS.map((_, i) => `sk-motion-${String(i).padStart(2, '0')}`),
  ...new Set(SPECIES_SKILLS.flat().flatMap((k) => k.fx.map((f) => f.img))),
];
