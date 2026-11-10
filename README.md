# 프로젝트 모음

드래곤 게임의 소스·그림·빌드 도구·문서는 [`dragon project`](dragon%20project/) 폴더에 있습니다.

## 드래곤 게임 개발

```sh
cd "dragon project"
npm ci
npm test
npm start
```

기획과 구현 기준은 [SPEC.md](dragon%20project/SPEC.md), 변경 기록은 [DEVLOG.md](dragon%20project/DEVLOG.md)를 참고하세요.
Windows 배포본은 해당 폴더에서 `sh tools/pack.sh release`로 만듭니다.

GitHub Actions 설정은 `.github/workflows/`에 유지하며, 게임 폴더 안에서 빌드합니다.
기존 체크아웃에서도 변경을 받은 뒤 `dragon project` 폴더에서 명령을 실행하세요. 개인 저장 경로와 게임 규칙은 변경하지 않았습니다.

기존 경로에서 작업하던 기능 브랜치를 합칠 때에는 파일 이동을 고려해 충돌을 확인하세요. 이 정리는 main에 포함된 파일만 이동하며 아직 병합되지 않은 기능을 포함하지 않습니다.
