import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHECKS, EVIDENCE, MAX_OUTPUT_BYTES, MAX_REPORT_BYTES, boundedProcess, fixtureHtml, routeFor, validateReport } from './run.mjs';

function reportFixture() {
  return { pass: true, evidence: EVIDENCE, checks: Object.fromEntries(CHECKS.map(name => [name, true])),
    open_ack: { gui_applied: true, state_version: 0, rendered_version: 0, generation: 1 },
    update_ack: { gui_applied: true, state_version: 2, rendered_version: 2, generation: 2 },
    close_ack: { gui_applied: true, state_version: 2, rendered_version: 2, generation: 3 },
    reopen_ack: { gui_applied: true, state_version: 2, rendered_version: 2, generation: 4 },
    reclose_ack: { gui_applied: true, state_version: 2, rendered_version: 2, generation: 5 },
    metrics: { workers_started: 2, worker_messages: 5, worker_geojson: 2, workers_terminated: 2, gl_contexts: 2, gl_draws: 8, assets_created: 4, assets_disposed: 4, subscriptions: 1, unsubscribed: 1, external_attempts: 0, worker_raw_canary: false },
    cycles: [{ workers_started: 1, workers_terminated: 1, assets_created: 2, assets_disposed: 2, css_removed: true, canvas_removed: true, modal_unmounted: true, gl_draws: 4, ack_cleanup_complete: true }, { workers_started: 2, workers_terminated: 2, assets_created: 4, assets_disposed: 4, css_removed: true, canvas_removed: true, modal_unmounted: true, gl_draws: 8, ack_cleanup_complete: true }],
    feature_count: 9, geometry_types: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'] };
}
function validateCases(cases) {
  return cases.map(value => { try { return { report: validateReport(JSON.stringify(value)) }; } catch (error) { return { code: error.code }; } });
}
async function processResult(args, bounds) {
  try { return { result: await boundedProcess(process.execPath, args, bounds) }; } catch (error) { return { code: error.code, result: error.result }; }
}

test('모든 실제 렌더와 정리 근거가 있는 보고서만 통과한다', () => {
  // given
  const input = reportFixture();
  // when
  const actual = validateReport(JSON.stringify(input));
  // then
  assert.equal(actual.pass, true);
  assert.deepEqual(actual.checks, input.checks);
});

test('실패 보고서는 실제 WebGL 실패를 성공으로 바꾸지 않는다', () => {
  // given
  const input = { pass: false, evidence: EVIDENCE, code: 'WEBGL_UNAVAILABLE' };
  // when
  const actual = validateReport(JSON.stringify(input));
  // then
  assert.equal(actual.pass, false);
  assert.equal(actual.code, 'WEBGL_UNAVAILABLE');
});

test('숫자 truthy와 다른 실행 근거는 성공 보고서로 받지 않는다', () => {
  // given
  const inputs = [{ ...reportFixture(), pass: 1 }, { ...reportFixture(), evidence: 'jsdom_mock' }];
  // when
  const actual = validateCases(inputs);
  // then
  assert.ok(actual.every(value => value.code === 'INVALID_REPORT'));
});

test('필수 검사가 빠지거나 추가되거나 false이면 보고서를 거부한다', () => {
  // given
  const missing = reportFixture(); delete missing.checks.real_webgl;
  const extra = reportFixture(); extra.checks.guessed = true;
  const failed = reportFixture(); failed.checks.worker_terminated = false;
  // when
  const actual = validateCases([missing, extra, failed]);
  // then
  assert.ok(actual.every(value => value.code === 'INVALID_REPORT'));
});

test('ACK의 version과 generation 및 렌더 완료를 각각 검증한다', () => {
  // given
  const inputs = [];
  for (const name of ['open_ack', 'update_ack', 'close_ack', 'reopen_ack', 'reclose_ack']) {
    for (const field of ['state_version', 'generation', 'rendered_version', 'gui_applied']) {
      const input = reportFixture(); input[name][field] = field === 'gui_applied' ? false : field === 'rendered_version' ? null : 999;
      inputs.push(input);
    }
  }
  // when
  const actual = validateCases(inputs);
  // then
  assert.equal(actual.length, 20);
  assert.ok(actual.every(value => value.code === 'INVALID_REPORT'));
});

test('두 번째 open은 새 Worker와 렌더를 만들고 매 close가 자원을 끝내야 한다', () => {
  // given
  const noReopen = reportFixture(); noReopen.cycles.pop();
  const reused = reportFixture(); reused.cycles[1].workers_started = 1; reused.cycles[1].workers_terminated = 1;
  const retained = reportFixture(); retained.cycles[0].workers_terminated = 0;
  const noRedraw = reportFixture(); noRedraw.cycles[1].gl_draws = noRedraw.cycles[0].gl_draws;
  const staleCss = reportFixture(); staleCss.cycles[0].css_removed = false;
  const lateCleanup = reportFixture(); lateCleanup.cycles[0].ack_cleanup_complete = false;
  // when
  const actual = validateCases([noReopen, reused, retained, noRedraw, staleCss, lateCleanup]);
  // then
  assert.ok(actual.every(value => value.code === 'INVALID_REPORT'));
});

test('실제 Worker와 draw가 영이면 체크 표시만으로 통과하지 못한다', () => {
  // given
  const inputs = ['workers_started', 'worker_messages', 'worker_geojson', 'gl_contexts', 'gl_draws'].map(name => { const input = reportFixture(); input.metrics[name] = 0; return input; });
  // when
  const actual = validateCases(inputs);
  // then
  assert.ok(actual.every(value => value.code === 'INVALID_REPORT'));
});

test('자원 미해제와 외부 요청 및 원본 속성 Worker 전달을 거부한다', () => {
  // given
  const inputs = ['workers_terminated', 'assets_disposed', 'unsubscribed', 'external_attempts', 'worker_raw_canary'].map(name => {
    const input = reportFixture(); input.metrics[name] = name === 'worker_raw_canary' ? true : name === 'external_attempts' ? 1 : 0; return input;
  });
  // when
  const actual = validateCases(inputs);
  // then
  assert.ok(actual.every(value => value.code === 'INVALID_REPORT'));
});

test('일곱 geometry 형식과 NULL 및 EMPTY의 아홉 feature를 요구한다', () => {
  // given
  const missingType = reportFixture(); missingType.geometry_types[6] = 'Point';
  const missingNull = reportFixture(); missingNull.feature_count = 7;
  // when
  const actual = validateCases([missingType, missingNull]);
  // then
  assert.ok(actual.every(value => value.code === 'INVALID_REPORT'));
});

test('64KiB를 넘는 메시지는 JSON 해석 전에 거부한다', () => {
  // given
  const raw = Buffer.alloc(MAX_REPORT_BYTES + 1, 32);
  // when
  const actual = (() => { try { validateReport(raw); return null; } catch (error) { return error.code; } })();
  // then
  assert.equal(actual, 'REPORT_TOO_LARGE');
});

test('깨진 JSON과 배열 및 pass 누락은 유효한 보고서가 아니다', () => {
  // given
  const inputs = ['{', '[]', JSON.stringify({ evidence: EVIDENCE })];
  // when
  const actual = inputs.map(input => { try { validateReport(input); return null; } catch (error) { return error.code; } });
  // then
  assert.deepEqual(actual, ['INVALID_REPORT', 'INVALID_REPORT', 'INVALID_REPORT']);
});

test('정확한 loopback 경로 다섯 개만 서버가 제공한다', () => {
  // given
  const routes = ['/index.html', '/shim.js', '/production/index.js', '/style.css', '/maplibre-worker.js'];
  // when
  const actual = routes.map(path => routeFor('GET', path, '127.0.0.1:12345', 12345));
  // then
  assert.deepEqual(actual, routes);
});

test('경로 순회와 query 및 다른 host나 method를 제공하지 않는다', () => {
  // given
  const inputs = [['GET', '/../index.html', '127.0.0.1:12345'], ['GET', '/%2e%2e/index.html', '127.0.0.1:12345'], ['GET', '/shim.js?import', '127.0.0.1:12345'], ['GET', '/node_modules/react.js', '127.0.0.1:12345'], ['GET', '/index.html', 'localhost:12345'], ['GET', '/index.html', '127.0.0.1:12346'], ['POST', '/index.html', '127.0.0.1:12345']];
  // when
  const actual = inputs.map(([method, path, host]) => routeFor(method, path, host, 12345));
  // then
  assert.ok(actual.every(value => value === null));
});

test('HTML은 React shim 뒤에 production IIFE를 직접 불러온다', () => {
  // given
  const expected = ['/shim.js', '/production/index.js'];
  // when
  const actual = fixtureHtml();
  // then
  assert.ok(actual.indexOf(expected[0]) < actual.indexOf(expected[1]));
  assert.ok(actual.includes('V1Fixture.start()'));
  assert.ok(!actual.includes('type="module"') && !actual.includes('https://'));
});

test('합성 fixture는 실제 Worker와 WebGL 호출을 전달하고 watchdog을 갖는다', async () => {
  // given
  const path = new URL('./fixture.tsx', import.meta.url);
  // when
  const actual = await readFile(path, 'utf8');
  // then
  assert.ok(actual.includes('class ObservedWorker extends nativeWorker') && actual.includes('super(url, options)'));
  assert.ok(actual.includes('Reflect.apply(nativeContext, this, args)') && actual.includes('Reflect.apply(original, this, args)'));
  assert.ok(actual.includes('45000') && actual.includes('JAVASCRIPT_TIMEOUT'));
  assert.ok(!actual.includes('FakeMap') && !actual.includes('jsdom'));
});

test('Swift는 비영속 저장소와 공개 WebKit API 및 60초 watchdog을 사용한다', async () => {
  // given
  const path = new URL('./WebViewHarness.swift', import.meta.url);
  // when
  const actual = await readFile(path, 'utf8');
  // then
  assert.ok(actual.includes('websiteDataStore = .nonPersistent()'));
  assert.ok(actual.includes('WKContentRuleListStore(url: rulesDirectory)') && actual.includes('.now() + 60'));
  assert.ok(actual.includes('removeScriptMessageHandler') && actual.includes('raw.count <= 65536'));
  assert.ok(!actual.includes('setValue(') && !actual.includes('forKey:'));
});

test('프로세스의 원본 stdout과 stderr 및 실패 exit를 보존한다', async () => {
  // given
  const args = ['-e', 'process.stdout.write("own-out");process.stderr.write("own-err");process.exitCode=7'];
  // when
  const actual = await processResult(args);
  // then
  assert.equal(actual.result.code, 7);
  assert.equal(actual.result.stdout.toString(), 'own-out');
  assert.equal(actual.result.stderr.toString(), 'own-err');
});

test('출력 상한을 넘긴 자기 프로세스만 중단하고 bounded 로그를 남긴다', async () => {
  // given
  const args = ['-e', `process.stdout.write(Buffer.alloc(${MAX_OUTPUT_BYTES + 1},65));setInterval(()=>{},1000)`];
  // when
  const actual = await processResult(args);
  // then
  assert.equal(actual.code, 'OUTPUT_LIMIT');
  assert.ok(actual.result.stdout.length + actual.result.stderr.length <= MAX_OUTPUT_BYTES);
});

test('watchdog은 자기 프로세스가 끝나지 않으면 실패로 반환한다', async () => {
  // given
  const args = ['-e', 'setInterval(()=>{},1000)'];
  // when
  const actual = await processResult(args, { timeout: 50 });
  // then
  assert.equal(actual.code, 'PROCESS_TIMEOUT');
  assert.equal(actual.result.signal, 'SIGKILL');
});

test('상대 실행파일과 60초를 넘는 실행 요청은 시작하지 않는다', async () => {
  // given
  const cases = [['node', {}], [process.execPath, { timeout: 60001 }], [process.execPath, { maximum: MAX_OUTPUT_BYTES + 1 }]];
  // when
  const actual = await Promise.all(cases.map(async ([executable, bounds]) => { try { await boundedProcess(executable, [], bounds); return null; } catch (error) { return error.code; } }));
  // then
  assert.deepEqual(actual, ['INVALID_PROCESS_BOUNDS', 'INVALID_PROCESS_BOUNDS', 'INVALID_PROCESS_BOUNDS']);
});
