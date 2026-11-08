"""종족 스킬 이미지를 게임용으로 가공한다.

사용: python3 tools/build_skill_assets.py <정리본_12종 폴더> <보완_추가_이미지 폴더> [출력 폴더=public/img]

입력 (2026-11-07~08 생성 이미지 ZIP)
  01_정리본_12종/<NN_종족>/<종족>_<번호>_<스킬>_<용도>.png   스킬 이펙트 원화
  보완_추가_이미지/<NN_종족>/S###_<종족>_<스킬>_모션키포즈3컷.png  준비/발동/회수 3컷 (각 724×724)

출력 (모두 public/img 바로 아래. bf://img/ 프로토콜이 폴더를 무시하므로 하위 폴더를 쓰지 않는다)
  sk-motion-NN.png   종족 NN의 스킬 모션 시트. 3열(준비·발동·회수) × 4행(공격·방어·생활·궁극기), 칸 290×240.
                     칸 바닥 = 발바닥(알파 기준 가장 아래), 가로는 원본 칸 그대로(가운데 정렬).
  sk-NN-MM.png       종족 NN 정리본 번호 MM 이펙트. 투명 여백을 잘라 내고 긴 변 기준으로 줄인다.
"""
import sys, os, glob, re
from PIL import Image

SPECIES = ['흑염룡', '레드', '블루', '에메랄드', '백은', '루비', '호박', '화산', '흑요석', '황금', '서리', '폭풍']
# 슬롯 순서: 공격 · 방어 · 생활 · 궁극기 (파일 이름의 띄어쓰기 없는 스킬 이름)
SKILLS = [
    ['흑염낙인', '혈통인장', '잿불묻기', '재의기록'],
    ['열관성', '맞불', '구들돌', '가마소성'],
    ['거품그물', '물그림자', '물때', '발묵'],
    ['접순', '덩굴울타리', '꽃시계', '휘묻이숲'],
    ['회전등명', '안개막', '귀환등대', '브로켄강림'],
    ['성채', '패싯전반사', '광채분산', '루비발진'],
    ['호박봉입', '밀랍봉개', '8자춤', '분봉'],
    ['내리막화쇄류', '용암동굴', '간헐천예보', '분화경보'],
    ['정밀절제', '루퍼트의눈물', '정밀봉합', '능선박리'],
    ['금화대출', '금박펴기', '사금일기', '내림경매'],
    ['눈사태유도', '허들순환', '눈송이받기', '얼어붙은시간'],
    ['선행방전', '회로차단기', '섬광과천둥', '구전'],
]
SRC = 724          # 3컷 원본 칸
CROP_H = 600       # 발바닥 위로 잘라 낼 높이 (가장 키 큰 자세 기준)
CELL = (290, 240)  # 출력 칸 (724×600 비율)
ALPHA_CUT = 24     # 이보다 옅은 픽셀은 바운딩 박스 계산에서 뺀다
FX_MAX = (400, 300)


def bbox(im):
    return im.getchannel('A').point(lambda v: 255 if v > ALPHA_CUT else 0).getbbox()


def motion_sheets(motion_dir, out):
    files = glob.glob(os.path.join(motion_dir, '*', '*모션키포즈3컷.png'))
    for sp, names in enumerate(SKILLS):
        sheet = Image.new('RGBA', (CELL[0] * 3, CELL[1] * 4), (0, 0, 0, 0))
        for slot, name in enumerate(names):
            f = [x for x in files if os.path.basename(x).split('_')[1] == SPECIES[sp] and os.path.basename(x).split('_')[2] == name]
            if len(f) != 1:
                raise SystemExit(f'모션 파일을 찾지 못함: {SPECIES[sp]} {name} → {f}')
            im = Image.open(f[0]).convert('RGBA')
            frames = [im.crop((k * SRC, 0, (k + 1) * SRC, SRC)) for k in range(3)]
            bottom = max(bbox(fr)[3] for fr in frames)
            top = bottom - CROP_H
            for k, fr in enumerate(frames):
                c = Image.new('RGBA', (SRC, CROP_H), (0, 0, 0, 0))
                c.paste(fr.crop((0, max(0, top), SRC, bottom)), (0, max(0, -top)))
                c = c.resize(CELL, Image.LANCZOS)
                sheet.alpha_composite(c, (k * CELL[0], slot * CELL[1]))
        p = os.path.join(out, f'sk-motion-{sp:02d}.png')
        sheet.save(p, optimize=True)
        print(p, os.path.getsize(p) // 1024, 'KB')


def fx_images(fx_dir, out):
    n = 0
    for sp, name in enumerate(SPECIES):
        for f in sorted(glob.glob(os.path.join(fx_dir, f'{sp:02d}_*', '*.png'))):
            b = os.path.basename(f)
            m = re.match(rf'{name}_(\d+)_', b)
            if not m or '자세' in b:
                continue
            im = Image.open(f).convert('RGBA')
            bb = bbox(im)
            if not bb:
                continue
            pad = 6
            im = im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad)))
            k = min(1, FX_MAX[0] / im.width, FX_MAX[1] / im.height)
            if k < 1:
                im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            p = os.path.join(out, f'sk-{sp:02d}-{int(m.group(1)):02d}.png')
            im.save(p, optimize=True)
            n += 1
    print('이펙트', n, '장')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), '..', 'public', 'img')
    os.makedirs(out, exist_ok=True)
    motion_sheets(sys.argv[2], out)
    fx_images(sys.argv[1], out)
