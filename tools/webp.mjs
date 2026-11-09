// 빌드 뒤 dist/renderer/img 의 PNG를 WebP(품질 90, 알파 무손실)로 바꾼다. 용량 약 46MB → 14MB.
// 게임은 그림을 bf://img/<이름>.png 로 부르고, main.ts 프로토콜이 같은 이름의 .webp 를 대신 준다.
// 아이콘(app-icon*.png)은 Electron nativeImage 가 WebP를 못 읽어 PNG 그대로 둔다.
//   node tools/webp.mjs [폴더=dist/renderer/img]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = process.argv[2] || 'dist/renderer/img';
const keep = (f) => /^app-icon/.test(f);
let before = 0, after = 0, n = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.png') || keep(f)) continue;
  const src = path.join(dir, f);
  const out = src.slice(0, -4) + '.webp';
  before += fs.statSync(src).size;
  await sharp(src).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toFile(out);
  after += fs.statSync(out).size;
  fs.unlinkSync(src);
  n++;
}
console.log(`WebP ${n}장: ${(before / 1e6).toFixed(1)}MB → ${(after / 1e6).toFixed(1)}MB`);
