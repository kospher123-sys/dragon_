# 생성 이미지(단색 배경) → 게임 시트 합치기.
# python3 -I build_sprites.py <1차폴더> <2차폴더> <public/img>
import sys, os
import numpy as np
from PIL import Image
OLD, NEW, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
o = OLD + '/생성이미지_원본파일명/'

def key_out(path, flip=False, fade_right=False):
    im = Image.open(path).convert('RGB')
    im = im.crop((4, 4, im.width - 4, im.height - 4))   # 가장자리 테두리선 제거
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    a = np.asarray(im).astype(np.float32)
    b = np.concatenate([a[:6].reshape(-1,3), a[-6:].reshape(-1,3), a[:,:6].reshape(-1,3), a[:,-6:].reshape(-1,3)])
    key = np.median(b, 0)
    d = np.sqrt(((a - key) ** 2).sum(-1))
    alpha = np.clip((d - 70) / (150 - 70), 0, 1)
    rgb = a.copy()
    if key[1] > key[0] and key[1] > key[2]:      # 초록 배경: 초록 번짐 제거
        m = np.maximum(rgb[..., 0], rgb[..., 2])
        rgb[..., 1] = np.minimum(rgb[..., 1], m)
    else:                                         # 마젠타 배경: 가장자리만 번짐 제거
        spill = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1], 0, None) * (1 - alpha) * 0.9
        rgb[..., 0] -= spill; rgb[..., 2] -= spill
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    bb = img.getbbox(); img = img.crop(bb)
    if fade_right:   # 잘린 브레스 끝을 오른쪽 15% 구간에서 서서히 흐리게
        arr = np.asarray(img).astype(np.float32); w = arr.shape[1]; n = int(w * 0.15)
        ramp = np.ones(w); ramp[w - n:] = np.linspace(1, 0, n) ** 1.5
        arr[..., 3] *= ramp[None, :]
        img = Image.fromarray(arr.astype(np.uint8), 'RGBA')
    return img

def place(img, cw, ch, maxw, maxh, bottom, center_v=False):
    s = min(maxw / img.width, maxh / img.height)
    img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    cell = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    x = (cw - img.width) // 2
    y = (ch - img.height) // 2 if center_v else ch - bottom - img.height
    cell.alpha_composite(img, (x, max(0, y)))
    return cell

# ---------------- 드래곤: species.png 4열 × 11행 (칸 384×256)
CW, CH = 384, 256
BASE = os.path.join(os.path.dirname(__file__), '..', 'assets-src', 'species.base.png')  # 원래 4종 시트
old = Image.open(BASE).convert('RGBA')
old = old.resize((CW * 4, CH * 4), Image.LANCZOS)
src = {
 '루비':   [o+'a_clean_high_resolution_digital_illustration_on_a.png', o+'a_clean_high_detail_fantasy_illustration_on_a_sol.png', NEW+'/루비-브레스.png', o+'a_high_detail_fantasy_illustration_on_a_bright_sol.png'],
 '호박':   [o+'a_highly_detailed_fantasy_illustration_a_single_m.png', NEW+'/호박-걷기.png', NEW+'/호박-브레스.png', o+'a_highly_detailed_fantasy_illustration_of_a_golden.png'],
 '화산':   [NEW+'/화산-엎드림.png', NEW+'/화산-걷기.png', NEW+'/화산-브레스.png', NEW+'/화산-비행.png'],
 '흑요석': [NEW+'/흑요석-엎드림.png', o+'a_highly_detailed_fantasy_illustration_on_a_brigh.png', NEW+'/흑요석-브레스.png', o+'a_detailed_high_contrast_fantasy_illustration_of.png'],
 '황금':   [o+'a_highly_detailed_fantasy_illustration_of_a_majest.png', o+'a_highly_detailed_fantasy_golden_dragon_illustrati.png', NEW+'/황금-브레스.png', o+'a_highly_detailed_fantasy_illustration_of_the_same.png'],
 '서리':   [NEW+'/서리-엎드림.png', o+'a_highly_detailed_fantasy_illustration_of_an_ice_c.png', NEW+'/서리-브레스.png', o+'a_detailed_fantasy_illustration_on_a_bright_green.png'],
 '폭풍':   [NEW+'/폭풍-엎드림.png', o+'a_highly_detailed_fantasy_illustration_of_a_powerf.png', NEW+'/폭풍-브레스.png', o+'a_highly_detailed_fantasy_illustration_of_a_storm.png'],
}
fade = {NEW+'/루비-브레스.png', NEW+'/폭풍-브레스.png', NEW+'/서리-브레스.png'}
sheet = Image.new('RGBA', (CW * 4, CH * 11), (0, 0, 0, 0))
sheet.paste(old, (0, 0))
for r, (name, files) in enumerate(src.items(), start=4):
    for c, f in enumerate(files):
        img = key_out(f, fade_right=f in fade)
        cell = place(img, CW, CH, 372, 226 if c != 3 else 210, 20, center_v=(c == 3))
        sheet.alpha_composite(cell, (c * CW, r * CH))
sheet.save(OUT + '/species.png', optimize=True)

# ---------------- 몬스터: monsters-desk.png 8열 × 4행 (칸 256×256)
# 열: 걷기1~4 · 피격 · 기절1~2 · 일어남 / 행: 슬라임 · 고블린 · 오우거 · 리치
M = 256
def ogre_down():
    im = key_out(o+'three_quarter_right_facing_ogre_with_massive_hunch.png')
    return im.rotate(-90, expand=True, resample=Image.BICUBIC)   # 머리가 오른쪽으로 오게 눕힘(임시)
mon = [
 [o+'a_high_detail_fantasy_game_style_illustration_on_a.png', o+'a_dynamic_high_detail_game_art_style_illustration.png', o+'a_high_detail_digital_illustration_of_a_hit_damage.png', NEW+'/몬스터-슬라임-기절.png'],
 [o+'a_detailed_high_contrast_fantasy_illustration_on.png', o+'a_highly_detailed_game_style_fantasy_monster_illu.png', NEW+'/몬스터-고블린-피격.png', ('flip', NEW+'/몬스터-고블린-기절.png')],
 [o+'a_highly_detailed_fantasy_concept_art_of_the_same.png', ('flip', o+'a_highly_detailed_fantasy_concept_art_illustration.png'), o+'three_quarter_right_facing_ogre_with_massive_hunch.png', ('flip', NEW+'/몬스터-오크-기절.png')],  # 오우거 기절: 임시로 오크 기절
 [OLD+'/몬스터-리치-걷기A.png', OLD+'/몬스터-리치-걷기B.png', NEW+'/몬스터-리치-피격.png', NEW+'/몬스터-리치-기절.png'],
]
def load(spec):
    if spec == 'OGRE_DOWN': return ogre_down()
    if isinstance(spec, tuple): return key_out(spec[1], flip=True)
    return key_out(spec)
ms = Image.new('RGBA', (M * 8, M * 4), (0, 0, 0, 0))
for r, (wa, wb, hit, down) in enumerate(mon):
    A, B, H, D = load(wa), load(wb), load(hit), load(down)
    stand = lambda im: place(im, M, M, 236, 236, 6)
    flat = lambda im: place(im, M, M, 246, 150, 4)
    cells = [stand(A), stand(A), stand(B), stand(B), stand(H), flat(D), flat(D), stand(A)]
    for c, cell in enumerate(cells): ms.alpha_composite(cell, (c * M, r * M))
ms.save(OUT + '/monsters-desk.png', optimize=True)
print('ok', sheet.size, ms.size)
