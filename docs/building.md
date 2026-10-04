# 빌드와 설치

## 호스트와 기존 드라이버 준비

`node scripts/bootstrap.mjs`는 아래 세 디렉터리를 Spatial 저장소 옆에 생성합니다.

| 디렉터리 | upstream |
|---|---|
| `tabularis-host` | `TabularisDB/tabularis` |
| `tabularis-postgresql-plugin` | `TabularisDB/tabularis-postgresql-plugin` |
| `tabularis-sqlserver-plugin` | `TabularisDB/tabularis-sqlserver-plugin` |

정확한 base commit, 수정 source commit, 패치 SHA256과 최종 Git tree는
[`integration/upstreams.json`](../integration/upstreams.json)에 고정돼 있습니다.
부모 경로에 기존 checkout이 있으면 새 부모 디렉터리를 사용하세요.
bootstrap은 원래 저장소에 commit하거나 upstream에 push하지 않습니다.

## 지도 ZIP

README의 의존성 설치와 UI 빌드를 마친 뒤 실행합니다.
출력 파일은 아직 존재하지 않아야 합니다. Node는 아래 경로를 현재 디렉터리 기준으로 계산합니다.

```sh
node --input-type=module -e "import fs from 'node:fs'; fs.mkdirSync('artifacts', {recursive:true})"
node --input-type=module -e "import path from 'node:path'; import {packageBundle} from './scripts/package/index.mjs'; console.log(packageBundle({source:process.cwd(),output:path.resolve('artifacts/spatial-0.1.0.zip')}))"
```

ZIP 옆에 SHA256 파일을 생성합니다. ZIP에는 `.tabularium`, JS, CSS, MapLibre worker,
의존성 라이선스와 `release.json` 파일별 검증 목록이 포함됩니다.
ZIP은 운영체제 공통이며 실제 설치 동작은 각 운영체제의 호스트가 담당합니다.

## 호스트 실행

호스트는 공간 core를 sibling 경로에서 참조합니다. 디렉터리 이름과 배치를 유지하세요.
호스트 저장소의 운영체제별 Tauri 필수 도구를 먼저 설치합니다.

```sh
pnpm --dir ../tabularis-host build
pnpm --dir ../tabularis-host tauri dev
```

배포용 앱은 `pnpm --dir ../tabularis-host tauri build`로 만듭니다.
코드 서명·공증 자격 증명은 이 작업에서 사용하지 않았습니다.
개발 검증에는 `TABULARIS_DATA_DIR`와 `TABULARIS_PLUGIN_DIR`에 서로 분리한 절대 경로를 지정할 수 있습니다.
두 경로는 실제 사용자 프로필과 분리해야 합니다.

수정 호스트의 플러그인 설정에서 지도 ZIP을 설치합니다.
기존 PostgreSQL 드라이버도 패치된 소스로 빌드해야 새 공간 RPC를 사용할 수 있습니다.

```sh
cargo build --locked --release --manifest-path ../tabularis-postgresql-plugin/Cargo.toml
cargo build --locked --release --manifest-path ../tabularis-sqlserver-plugin/Cargo.toml
```

PostgreSQL 드라이버 패키지는 기존 upstream과 같이 `.tabularium`과 `postgresql-plugin` 실행 파일을
ZIP 루트에 둡니다. Windows 실행 파일 이름에는 `.exe`가 붙습니다.
SQL Server는 기존 패키징 절차에 따라 `.tabularium`, 실행 파일, UI·EXPLAIN 번들을 함께 넣습니다.
SQL Server UI는 호스트 plugin-api 빌드 후 해당 저장소의 `ui/`에서 frozen install과 build를 실행합니다.

## 되돌리기

이전 호스트와 이전 드라이버 조합으로 돌아가고 새 Spatial·Cosmos 패키지를 비활성화합니다.
기존 연결과 DB 데이터를 삭제하지 않습니다.
필요하면 새 지도·결과 캐시만 별도 보관합니다. DB schema migration은 없습니다.
