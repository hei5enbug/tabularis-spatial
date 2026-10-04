# GUI·CLI·MCP 사용법

## 지도

수정 호스트에서 패치된 PostgreSQL 드라이버와 Spatial ZIP을 활성화합니다.
기존 PostgreSQL 연결을 선택하고 PostGIS 공간 컬럼이 있는 쿼리를 실행합니다.
결과 도구 모음의 `Map`에서 공간 컬럼을 선택합니다.
테이블 탐색에서는 테이블과 공간 컬럼을 지정해 현재 지도 범위로 조회합니다.

쿼리 결과 지도는 저장된 원본 snapshot을 사용합니다.
열 이름이 중복돼도 result set 번호와 열 번호로 구분합니다.
테이블 지도는 현재 데이터이므로 저장된 쿼리 결과와 시점이 다를 수 있습니다.
객체 상세는 원본 식별자를 유지하며, 행 편집 후 새 조회는 별도 결과를 만듭니다.
객체 선택 목록은 100개씩 표시합니다. 이전·다음 버튼이나 페이지 번호로 모든 객체에 접근할 수 있습니다.
`더 보기`는 DB의 다음 결과 페이지를 추가하며, 지도에는 누적된 전체 객체를 표시합니다.

SRID가 없는 데이터는 SRID 입력 전까지 변환하지 않습니다.
날짜변경선 처리는 `preserve` 또는 `shortest`를 명시적으로 선택합니다.
GeoJSON 내보내기는 지도 표시용 좌표를 저장하며 DB 원본을 변경하지 않습니다.
파일 저장 창을 취소하면 저장 성공으로 처리하지 않습니다.

## CLI

수정 호스트 실행 파일에 `service` 하위 명령이 추가됩니다.
각 요청은 공통 JSON envelope를 사용합니다. 아래 내용을 `connections.json`으로 저장합니다.

```json
{
  "protocol_version": 1,
  "operation": "connection.list",
  "request_id": "list-connections-1",
  "connection_id": null,
  "session_id": null,
  "map_id": null,
  "expected_version": null,
  "deadline_ms": 30000,
  "input": {}
}
```

```sh
tabularis service --request connections.json
tabularis service --stdio
tabularis --mcp
```

`--stdio`는 한 줄에 요청 하나를 받고 한 줄에 JSON 응답 하나를 반환합니다.
결과 페이지, session, 인증 작업을 이어서 사용할 때는 이 프로세스를 유지합니다.
일회성 `--request` 프로세스가 끝나면 그 프로세스가 소유한 임시 결과와 session도 종료됩니다.
요청마다 고유 `request_id`와 명시적 `connection_id`를 사용합니다.
현재 GUI에서 선택한 연결에 의존하지 않습니다.

| 작업 | 사용 방법 |
|---|---|
| 쿼리 | `query.execute`, 정확한 SQL과 명시적 database·parameters |
| 저장 결과 페이지 | `result.get`, 원래 `result_id`·set 번호·offset |
| 결과 지도 | `spatial.query_result`, 결과·set·공간 컬럼 번호 |
| 테이블 지도 | `spatial.table_query`, 테이블·공간 컬럼·viewport |
| 내보내기 | `spatial.export`, 결과 또는 테이블 source |
| 작업 취소 | `job.cancel`, 응답에서 받은 작업 식별자 |
| 지도 변경 | `map.*`, `map_id`와 변경 전 `expected_version` |

전체 입력 계약은 준비한 호스트의 `packages/service-contracts/schema/v1/request.json`에 있습니다.
대량 결과는 페이지·요약·파일 참조로 받습니다. 응답의 `limits.truncated`와 `limits.reasons`를 확인하세요.
GeoJSON artifact는 다음 명령으로 아직 존재하지 않는 절대 경로에 저장합니다.

```sh
tabularis service artifact-save artifact-UUID --output /absolute/new-file.geojson
```

`map.open`과 화면 반영을 기다리는 지도 변경은 `gui_instance_id`도 필요합니다.
실행 중인 GUI의 capabilities에서 ID를 받거나 `GUI_UNAVAILABLE` 오류의 `details.instances`를 확인합니다.
지도 상태 저장 성공과 화면 적용 성공은 구분합니다. `gui_applied: true`는 실제 GUI의 적용 응답을 받은 경우입니다.
GUI가 없어도 DB 조회와 GeoJSON 내보내기를 실행할 수 있습니다.

## MCP

MCP 클라이언트의 stdio 서버 명령을 수정 호스트 실행 파일, 인자를 `["--mcp"]`로 설정합니다.
`tools/list`는 공통 operation 도구와 기존 도구를 함께 반환합니다.
공통 도구의 이름은 `query.execute`, `spatial.export`, `map.open`처럼 operation 이름과 같습니다.
각 `arguments`에는 위와 같은 전체 envelope를 넣습니다.
기존 `run_query` 등도 유지하며, Cosmos 쿼리는 database와 container를 명시해야 합니다.

MCP 결과에는 요약·소량 sample·페이지 정보·artifact 참조가 포함됩니다.
파일은 `tabularis://artifact/ID`와 제한된 chunk resource로 읽습니다.
원본 공간 좌표 전체를 대화 응답으로 반환하지 않습니다.

## 쓰기와 인증

기본은 읽기 전용입니다. SQL 첫 단어로 쓰기 권한을 판단하지 않습니다.
쓰기 허용 연결에서 GUI 쓰기 옵션, CLI `--write`, MCP `query.execute_write`로 쿼리 쓰기 의도를 명시합니다.
승인 요청이 생기면 GUI에서 승인하거나 다음 명령을 사용합니다.

```sh
tabularis service approve APPROVAL_ID --decision approve
tabularis service approve APPROVAL_ID --decision deny
```

비밀번호·키·토큰은 명령 인자나 요청 JSON에 넣지 않습니다.
GUI의 보호 입력, CLI의 `--credential-stdin`, Unix의 `--credential-fd`로 전달합니다.
`--credential-stdin`은 요청 파일과 함께 쓰며 `--request -` 또는 `--stdio`와 함께 사용할 수 없습니다.
`--stdio --credential-fd`는 소비할 요청을 `--credential-request-id`로 고정합니다.
Windows에서는 파일 서술자 입력 대신 보호된 stdin을 사용합니다.

Entra 사용자 로그인은 로그인·MFA 과정을 거치고, 무인 자동화는 앱 자격 증명을 사용합니다.
실제 Azure 인증·토큰 갱신·TLS 검증은 보류 상태입니다.
취소 응답의 `outcome`이 불명확하면 쓰기를 자동 재실행하지 말고 대상 DB 상태를 확인합니다.
