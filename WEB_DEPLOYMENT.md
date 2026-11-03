# 주소로 접속하는 웹게임 배포

이 게임은 React 웹앱이며, 서버 계정이나 API 키 없이 정적 웹 호스팅에 배포할 수 있습니다. 게임 진행은 접속한 브라우저의 IndexedDB에 저장됩니다. 기기를 옮길 때는 게임 안의 저장 파일 내보내기/불러오기를 사용하세요.

## GitHub Pages

`.github/workflows/deploy.yml`은 `main` 브랜치에 코드가 올라오면 엔진 테스트 및 프로덕션 빌드를 실행하고 `dist`를 GitHub Pages에 배포합니다. 저장소 이름 경로 아래에서도 자바스크립트와 CSS가 로드되도록 상대 경로를 사용합니다.

처음에는 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해야 합니다. 성공한 배포 작업의 `github-pages` 환경에 표시되는 실제 URL로 접속하세요. 배포가 성공하기 전에는 공개 접속 주소가 생성되었다고 볼 수 없습니다.

## 다른 정적 호스팅

`npm ci`와 `npm run build`를 실행하고 `dist` 폴더의 내용을 웹 호스팅에 업로드하면 됩니다. `releases/LCK-Manager-web.zip`은 해당 폴더 내용을 압축한 배포용 파일입니다. 서버 실행이나 외부 데이터베이스는 필요하지 않습니다. 브라우저 저장 기능을 위해 HTTPS로 제공하는 것을 권장합니다.

## 로컬에서 웹 버전 확인

`npm run dev`로 개발 서버를 실행하거나 `npm run build` 이후 `npm run preview`로 프로덕션 결과물을 확인하세요. 클라우드 환경의 내부 주소는 인터넷 공개 주소가 아닙니다.
