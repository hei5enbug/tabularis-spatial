# 검증 현황과 재현

코드는 실제 Azure 검증을 제외하고 로컬·플랫폼 검증을 진행하고 있다. 사용자가 실제 Azure 검증을 보류했으므로 Azure SQL과 Cosmos를 연동 완료로 표시하지 않는다. 아래의 native는 해당 OS에서 실제 실행했다는 뜻이며, synthetic은 대체 서버·드라이버 또는 플랫폼 입력을 사용했다는 뜻이다.

## 확인한 동작

| 영역 | 실행 환경과 결과 | 증거의 범위 |
|---|---|---|
| 공간 모델 | Spatial Rust core 68개 통과 | 원본 식별·좌표/행/바이트 제한·지도 버전 |
| 기존 PostgreSQL 드라이버 | unit 402개, 실제 PostGIS 74개 통과 | 원본 EWKB·geometry/geography·SRID·Z/M·NULL/EMPTY·읽기 전용·취소 |
| 공통 서비스 공간 조회 | 실제 PG17/18 조회 4개, PG18 대용량 export 1개 통과 | 불변 쿼리 결과·원 SQL 재실행 0회·변환·페이지·연결별 취소·32 MiB 초과 명시 export |
| 지도 UI | React 검사 97개, typecheck/build 통과 | 레이어·속성·선택·상태·오래된 응답 차단·artifact 저장 호출 |
| WebView 렌더링 | macOS WKWebView 22개 통과 | 실제 WebGL·로컬 CSS/worker·모달 열기/닫기. 서비스는 mock이며 실제 Tauri 통합 증거와 구분 |
| 공통 transport | 전체 서비스 검사 204개 통과, 기존 자식 프로세스 검사 1개 별도 실행 | operation 스키마·정책·결과·오류·CLI/MCP registry·실제 로컬 IPC |
| 네이티브 진입점 | native 16개·지도 ACK 1개·산출물 취소 1개·CLI 3개·MCP 7개·기존 회귀 23개, host check 통과 | Tauri 명령 권한·별도 native core의 IPC·정확한 SQL·비밀 입력·bounded 출력. 실제 앱 화면 검사는 별도 |
| 쿼리 화면 | 격리 검사 32개, Notebook 16개, frontend build/typecheck/ESLint 통과 | 고정된 연결·정확한 SQL·결과 참조·세션·취소·명시적 쓰기 승인 |
| 기존 SQL Server 드라이버 | unit 244개·conformance 3개·synthetic Azure 33개·clippy 통과 | Entra 사용자/앱 인증 경로·토큰 갱신·TLS 검증·원본 SQL·CRUD. 실제 Azure는 미실행 |
| Cosmos | unit 625개·protocol 14개·synthetic live harness 74개 통과 | 공식 SDK의 문서/페이지/RU/429/ETag 계약, 실제 Azure는 미실행 |
| 실제 설치 | macOS ARM64와 Rosetta x64 Cosmos ZIP, Spatial ZIP을 수정 호스트 설치기로 검사 | ZIP 모든 파일의 SHA·권한·asset MIME, 동봉 Node 실행, initialize/shutdown, 빈 PATH |
| OS 공통 설치 검사 | macOS에서 Spatial ZIP 실제 설치 1개 통과 | 동일 테스트를 Linux/Windows/macOS CI에 등록. 다른 OS의 실행 결과는 CI로 확인 |
| 소스 재현 | 공개 upstream 3개를 고정 SHA로 fetch하고 patch 적용 후 Git tree 검증 통과 | 로컬 비공개 호스트 레포를 내려받을 필요 없음 |
| 독립 디렉터리 빌드 | 한글·공백 경로에서 frozen install, 공통 계약/API, UI build/test, ZIP 생성 통과 | 기존 작업 폴더의 node_modules나 dist를 복사하지 않음 |

각 행은 해당 변경 시점의 검사다. 서로 다른 실행의 통과 수를 합산해 최종 단일 실행 결과로 표시하지 않는다. 중간 실패는 삭제하지 않았으며 수정 뒤 필요한 범위를 다시 검사했다. 호스트 전체 strict clippy는 기존 코드의 경고 때문에 실패한다. 변경 영역의 새 경고와 기존 경고를 구분해 검사했으며 전체 clippy 통과라고 주장하지 않는다.

독립 빌드의 Spatial ZIP은 488,269 bytes·33 files이며 SHA-256은 `df9032d9c3f4ed4b87197ae1b4365bbc1598de6e1a9a2e7620cbb03a37ff9d65`다. 앞서 수정 호스트의 실제 설치기로 검사한 ZIP과 byte 단위로 동일하다.

## 실제 fixture

| 환경 | 고정 버전 | 이미지 digest |
|---|---|---|
| PG17 | PostgreSQL 17.7 / PostGIS 3.5.2, ARM64 | `sha256:bac8128cd62a35471a1e97966861aa2ac88c8d2f408767a425ae70695a607c99` |
| PG18 | PostgreSQL 18.6 / PostGIS 3.6.4, amd64 emulation | `sha256:7e00e8c3539fdd43f513b98806c8204714dcd09dea683c259e333d7690317119` |
| 로컬 SQL Server | SQL Server 2022 Developer 16.0.4245.2, amd64 emulation | `sha256:49b45a911dc535e9345fbfd7101a1bd8a1e190a5f29b877ef75387a061e5fcf0` |
| 실제 WebView | macOS 26.5 (25F71), WebKit 21624.2.5.11.4 | React 19.2.4, MapLibre 6.11.2 |

emulation 결과로 native 성능을 추정하지 않는다. 로컬 fixture는 검사용 임시 스키마만 생성·정리했고 기존 사용자 DB나 Azure 자원을 사용하지 않았다.

## 재실행

먼저 [빌드 절차](building.md)를 수행한다. 일반 검사는 Azure 자격 증명을 요구하지 않는다.

```sh
node --test tests/bootstrap.test.mjs
cargo test --locked --workspace
pnpm test:ui
node --test tests/install/*.test.mjs
cargo test --locked --manifest-path ../tabularis-host/src-tauri/Cargo.toml --lib services::
```

호스트의 실제 PostGIS 검사는 `TABULARIS_TEST_POSTGIS_PLUGIN`에 빌드한 기존 PostgreSQL 플러그인의 절대 경로를, `TABULARIS_TEST_POSTGIS17_PORT`와 `TABULARIS_TEST_POSTGIS18_PORT`에 전용 로컬 fixture 포트를 지정한다. DB는 `spatial_fixture`, 사용자는 `postgres`, 접속 주소는 `127.0.0.1`이다. 두 fixture 모두 PostGIS 확장이 필요하다. 실제 검사는 임시 스키마를 생성하므로 전용 테스트 DB에서 실행한다.

```sh
cargo test --locked --manifest-path ../tabularis-host/src-tauri/Cargo.toml \
  --lib service_spatial::tests::live -- --ignored --test-threads=1
cargo test --locked --manifest-path ../tabularis-host/src-tauri/Cargo.toml \
  --lib service_spatial::tests::export_live -- --ignored --test-threads=1
```

명시 실행에서 입력이 없으면 실패한다. 일반 unit 실행의 `ignored`는 실제 DB 검증 통과를 뜻하지 않는다. 계획의 JavaScript service fixture 예제에 해당하는 정책·dispatch·공간 결과 검사는 Rust `services`와 `service_spatial::tests`에서 실제 서비스와 mock DB 경계로 구현했다. 별도 JavaScript mock 서비스로 제품 동작을 복제하지 않는다.

## 아직 구분해야 하는 완료 조건

- 실제 Azure SQL의 MFA/앱 인증·갱신·TLS·CRUD와 실제 Cosmos의 교차 파티션 정렬·집계·페이지 재개는 사용자 결정에 따라 보류한다.
- 실제 Tauri GUI와 별도 CLI/MCP의 최종 지도 적용 검사는 제품 통합 결과가 확보된 뒤 기록한다.
- Linux·Windows의 native 설치 결과는 GitHub Actions의 실제 실행 결과를 기록한다. workflow 파일 작성이나 synthetic 플랫폼 검사를 native 실행으로 간주하지 않는다.
- 대용량 지도에서 입력 지연과 종료 후 자원 회수에 관한 최종 성능 수치는 아직 확정하지 않았다.

정확한 배포 소스는 [upstream manifest](../integration/upstreams.json)의 원본 SHA·수정 소스 SHA·Git tree·패치 SHA-256으로 고정한다. CI 로그와 배포 ZIP의 파일별 checksum을 함께 보관한다.
