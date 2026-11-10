// 패키징된 Windows exe의 아이콘과 버전 정보를 바꾼다 (wine 없이). node tools/seticon.mjs <exe> <ico>
import fs from 'node:fs';
import * as ResEdit from 'resedit';
import * as PE from 'pe-library';
const [exePath, icoPath] = process.argv.slice(2);
const exe = PE.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = PE.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const target = groups[0] ?? { id: 1, lang: 1033 };
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, target.id, target.lang, ico.icons.map((i) => i.data));
const vers = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
const [a, b, c] = pkg.version.split('.').map(Number);
for (const v of vers) {
  v.setFileVersion(a, b, c, 0, 1033);
  v.setProductVersion(a, b, c, 0, 1033);
  for (const lang of v.getAllLanguagesForStringValues()) {
    v.setStringValues(lang, { ProductName: '흑염룡 연대기', FileDescription: '흑염룡 연대기 데스크톱', CompanyName: '', LegalCopyright: '', FileVersion: pkg.version, ProductVersion: pkg.version });
  }
  v.outputToResourceEntries(res.entries);
}
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('icon groups', groups.length, 'version blocks', vers.length);
