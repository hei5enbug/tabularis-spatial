# tabularis-spatial

Tabularis에서 PostGIS 쿼리 결과와 테이블을 지도로 표시하는 확장입니다.
React·MapLibre UI, 공간 데이터 모델, 수정 호스트와 기존 PostgreSQL·SQL Server 드라이버의 소스 패치를 제공합니다.
새 PostgreSQL 드라이버를 만들지 않습니다.

| 구성 | 역할 |
|---|---|
| `ui/` | 지도 모달, 레이어, 객체 선택, 속성, GeoJSON 저장 |
| `crates/tabularis-spatial-core/` | 공간 결과, 원본 식별자, 표시 범위와 제한 검증 |
| `integration/` | 고정 upstream revision에 적용하는 호스트·기존 드라이버 패치와 SHA256 |
| `scripts/bootstrap.mjs` | 별도 checkout 생성과 패치 검증 |
| [tabularis-azure](https://github.com/hei5enbug/tabularis-azure) | Azure 연동: Cosmos NoSQL 드라이버, 문서 작업 공간과 Entra·Azure CLI 인증 UI |

공식 Tabularis **`0.26.0` 이상**에서 기본 PostGIS 테이블 지도 조회를 지원합니다.
지도 상태 저장·결과 스냅샷·MCP 지도 제어는 공통 서비스를 제공하는 **`0.26.1-spatial.1`** 호스트가 필요합니다.
이 저장소의 호스트 패치에는 공통 Rust 서비스, GUI·MCP·CLI 어댑터와 로컬 IPC가 포함됩니다.

## 시작하기

Node `24.21.0`, pnpm `10.30.3`, Rust `1.96.0`과 운영체제별 Tauri 빌드 도구가 필요합니다.
새 부모 디렉터리에서 저장소 이름을 그대로 사용합니다.

```sh
git clone https://github.com/hei5enbug/tabularis-spatial.git tabularis-spatial
cd tabularis-spatial
node scripts/bootstrap.mjs
pnpm --dir ../tabularis-host install --frozen-lockfile --ignore-scripts
pnpm --dir ../tabularis-host --filter @tabularis/service-contracts build
pnpm --dir ../tabularis-host --filter @tabularis/plugin-api build
pnpm install --frozen-lockfile --ignore-scripts
pnpm build:ui
cargo test --locked --workspace
```

bootstrap은 공개 upstream의 고정 commit을 받아 패치를 적용하고 Git tree hash를 확인합니다.
이미 있는 다른 checkout은 덮어쓰지 않습니다.
호스트만 준비하려면 `node scripts/bootstrap.mjs --only host`를 실행합니다.

[빌드·설치](docs/building.md), [GUI·CLI·MCP 사용법](docs/usage.md),
[검증 결과와 남은 검증](docs/verification.md)을 확인하세요.

## 공식 앱의 기본 지도

PostgreSQL 연결에서 테이블을 열고 `Map` 버튼을 누르세요.
기본 지도는 테이블을 새로 제한 조회합니다. SQL 편집기의 기존 실행 결과를 재조회하거나 바꾸지 않습니다.
공간 컬럼을 선택하고, SRID가 없는 행은 원본 좌표계 SRID를 입력한 뒤 조회합니다.
행 1,000개·좌표 100,000개·GeoJSON 8 MiB 상한을 적용하고 제한에 도달하면 표시합니다.
레이어 속성 확인과 표시 GeoJSON 내보내기를 지원합니다. 외부 배경지도는 기본으로 요청하지 않습니다.

`spatial` 패키지는 DB 실행 파일이 없는 UI 플러그인입니다.
기존 `postgres` 또는 `postgresql` 연결을 사용합니다.
0.26.0 로더가 인식하는 `kind: driver`로 설치하며 실제 호스트 API에 따라 기능을 선택합니다.
새 호스트 버전의 모든 동작을 자동으로 보장하는 것은 아닙니다.

## 데이터 처리 원칙

- 원본 geometry/geography, SRID, 좌표를 보존합니다. 지도 표시용 데이터만 WGS84 GeoJSON으로 변환합니다.
- SRID가 없으면 입력을 요구합니다. 포함·교차·거리 판정은 DB 원본 공간 타입으로 수행합니다.
- 쿼리 결과 지도는 저장된 결과를 사용합니다. 테이블 지도는 명시한 테이블과 현재 범위로 조회합니다.
- 행·좌표·응답 크기 제한에 도달하면 `truncated`와 제한 사유를 반환합니다.
- 쓰기는 연결의 쓰기 허용, 요청의 명시적 의도, 승인 절차를 통과해야 합니다.
- 취소되거나 결과가 불명확한 쓰기를 자동 재실행하지 않습니다.

## 현재 범위

지도는 PostGIS만 지원합니다. Cosmos와 Azure SQL은 연결·탐색·쿼리·CRUD 대상입니다.
`geography` 테이블의 제한된 viewport 조회는 명시적으로 거부합니다.
`world: true` 전체 범위 조회와 쿼리 결과의 geography 표시는 지원합니다.
지도 도형 편집, 자체 공간 연산, 타일 서버, 분산 큐는 포함하지 않습니다.

**실제 Azure SQL·Cosmos 검증은 인증·네트워크 문제가 해결된 뒤 우선 진행할 항목입니다.**
로컬 DB, 합성 인증 서버, mock 결과를 실제 Azure 연동 완료로 표시하지 않습니다.
GitHub Actions는 필요할 때 수동으로 실행하는 선택 사항이며 필수 완료 조건이 아닙니다.
실제 OS에서 직접 수행한 검증도 실행 환경과 결과를 기록하면 근거로 사용합니다.

## 라이선스

Apache-2.0입니다. upstream 패치의 원래 저작권과 라이선스를 유지합니다.
지도 ZIP에는 포함된 UI 의존성의 라이선스와 파일별 checksum이 들어 있습니다.
