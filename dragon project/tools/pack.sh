#!/bin/sh
# Windows 포터블 빌드: sh tools/pack.sh <출력폴더>
set -e
OUT=${1:-release}
npm run ${BUILD:-build}
rm -rf "$OUT"
npx electron-packager . Blackflame --platform=win32 --arch=x64 --electron-version=44.10.0 --out="$OUT" --asar \
  --executable-name=Blackflame --extra-resource=native/koffi --overwrite \
  --ignore='^/(src|test|tools|public|native|build|assets-src|node_modules|\.vite|vite\.config\.ts|vitest\.config\.ts|tsconfig\.json|package-lock\.json|SPEC\.md)'
P="$OUT/Blackflame-win32-x64"
find "$P/locales" -type f ! -name 'ko.pak' ! -name 'en-US.pak' -delete
node tools/seticon.mjs "$P/Blackflame.exe" build/icon.ico
