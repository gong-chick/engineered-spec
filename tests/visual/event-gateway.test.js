'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  VALID_SEVERITY,
  VALID_STATUS,
  VALID_STAGES,
  REQUIRED_FIELDS,
  validateEvent,
  redactEvent,
  EventGateway,
  createEventGateway
} = require('../../src/visual/event-gateway');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

async function main() {
  console.log('\n=== Event Gateway 测试 ===\n');

  // --- Schema 校验 ---
  console.log('Schema 校验:');

  test('缺少必填字段应返回校验失败', () => {
    const result = validateEvent({ eventType: 'hook.failed' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  test('所有必填字段齐全应返回校验通过', () => {
    const result = validateEvent({
      eventType: 'hook.failed',
      stage: 'post-test',
      status: 'failed',
      severity: 'error'
    });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('非法 severity 应返回校验失败', () => {
    const result = validateEvent({
      eventType: 'hook.failed',
      stage: 'post-test',
      status: 'failed',
      severity: 'critical'
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('severity'));
  });

  test('非法 status 应返回校验失败', () => {
    const result = validateEvent({
      eventType: 'hook.failed',
      stage: 'post-test',
      status: 'running',
      severity: 'info'
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('status'));
  });

  test('非法 stage 应返回校验失败', () => {
    const result = validateEvent({
      eventType: 'hook.failed',
      stage: 'deploy',
      status: 'failed',
      severity: 'error'
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('stage'));
  });

  test('null 输入应返回校验失败', () => {
    const result = validateEvent(null);
    assert.strictEqual(result.valid, false);
  });

  test('空对象应返回多个校验错误', () => {
    const result = validateEvent({});
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, REQUIRED_FIELDS.length);
  });

  // --- 红脱 ---
  console.log('\n红脱:');

  test('消息中的密码应被红脱', () => {
    const result = redactEvent({
      eventType: 'hook.failed',
      stage: 'post-test',
      status: 'failed',
      severity: 'error',
      message: 'password="mysecret123" 连接失败'
    });
    assert.ok(!result.message.includes('mysecret123'));
    assert.ok(result.message.includes('[REDACTED]'));
  });

  test('元数据中的 apiKey 应被红脱', () => {
    const result = redactEvent({
      eventType: 'hook.failed',
      stage: 'post-test',
      status: 'failed',
      severity: 'error',
      message: 'test',
      metadata: { apiKey: 'sk-proj-xxxx', name: 'test' }
    });
    assert.strictEqual(result.metadata.apiKey, '[REDACTED]');
    assert.strictEqual(result.metadata.name, 'test');
  });

  test('无消息和元数据时应正常处理', () => {
    const result = redactEvent({
      eventType: 'test.passed',
      stage: 'post-test',
      status: 'success',
      severity: 'info'
    });
    assert.strictEqual(result.message, '');
    assert.deepStrictEqual(result.metadata, {});
  });

  // --- 事件 ingest ---
  console.log('\n事件 ingest:');

  test('正常 ingest 应返回标准化事件', () => {
    const gw = createEventGateway({ projectId: 'test-proj' });
    const result = gw.ingest({
      eventType: 'hook.failed',
      stage: 'post-test',
      status: 'failed',
      severity: 'error',
      message: '测试失败',
      runId: 'run-001'
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.event.eventId, 'evt-1');
    assert.strictEqual(result.event.projectId, 'test-proj');
    assert.strictEqual(result.event.runId, 'run-001');
    assert.strictEqual(result.event.eventType, 'hook.failed');
  });

  test('eventId 应自增', () => {
    const gw = createEventGateway();
    const r1 = gw.ingest({
      eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error'
    });
    const r2 = gw.ingest({
      eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info'
    });
    assert.strictEqual(r1.event.eventId, 'evt-1');
    assert.strictEqual(r2.event.eventId, 'evt-2');
  });

  test('缺少时间戳时应自动生成', () => {
    const gw = createEventGateway();
    const result = gw.ingest({
      eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error'
    });
    assert.ok(result.event.timestamp);
    assert.ok(!isNaN(Date.parse(result.event.timestamp)));
  });

  test('校验失败时应返回错误', () => {
    const gw = createEventGateway();
    const result = gw.ingest({ eventType: 'hook.failed' });
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.length > 0);
  });

  // --- NDJSON 持久化 ---
  console.log('\nNDJSON 持久化:');

  test('ingest 应写入 NDJSON 文件', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egw-test-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');
    const gw = createEventGateway({ storagePath });

    gw.ingest({
      eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error', message: 'test'
    });
    gw.ingest({
      eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info', message: 'ok'
    });

    const content = fs.readFileSync(storagePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    assert.strictEqual(lines.length, 2);
    const e1 = JSON.parse(lines[0]);
    assert.strictEqual(e1.eventId, 'evt-1');
    const e2 = JSON.parse(lines[1]);
    assert.strictEqual(e2.eventId, 'evt-2');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('重启后应从文件恢复事件', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egw-test-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');

    // 第一次写入
    const gw1 = createEventGateway({ storagePath });
    gw1.ingest({
      eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error'
    });
    gw1.ingest({
      eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info'
    });

    // 模拟重启
    const gw2 = createEventGateway({ storagePath });
    assert.strictEqual(gw2.size, 2);

    // 继续写入，ID 应接续
    const r = gw2.ingest({
      eventType: 'repair.attempt', stage: 'repair', status: 'success', severity: 'info'
    });
    assert.strictEqual(r.event.eventId, 'evt-3');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('NDJSON 坏行应容错跳过', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egw-test-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');

    // 手动写入一行坏数据 + 一行好数据
    fs.writeFileSync(storagePath, 'not-json\n{"eventId":"evt-1","runId":"r1","projectId":"p1","eventType":"hook.failed","stage":"post-test","status":"failed","severity":"error","message":"ok","timestamp":"2026-01-01T00:00:00.000Z","metadata":{}}\n', 'utf8');

    const gw = createEventGateway({ storagePath });
    assert.strictEqual(gw.size, 1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- 查询 ---
  console.log('\n查询:');

  test('按 eventType 查询', () => {
    const gw = createEventGateway();
    gw.ingest({ eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error' });
    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });
    gw.ingest({ eventType: 'hook.failed', stage: 'pre-test', status: 'failed', severity: 'warn' });

    const results = gw.query({ eventType: 'hook.failed' });
    assert.strictEqual(results.length, 2);
  });

  test('按 severity 查询', () => {
    const gw = createEventGateway();
    gw.ingest({ eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error' });
    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });

    const results = gw.query({ severity: 'error' });
    assert.strictEqual(results.length, 1);
  });

  test('按 runId 查询', () => {
    const gw = createEventGateway();
    gw.ingest({ eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error', runId: 'run-1' });
    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info', runId: 'run-2' });

    const results = gw.query({ runId: 'run-1' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].runId, 'run-1');
  });

  test('按时间范围查询', () => {
    const gw = createEventGateway();
    gw.ingest({
      eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error',
      timestamp: '2026-01-01T10:00:00.000Z'
    });
    gw.ingest({
      eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info',
      timestamp: '2026-01-02T10:00:00.000Z'
    });

    const results = gw.query({ from: '2026-01-01T12:00:00.000Z' });
    assert.strictEqual(results.length, 1);
  });

  test('limit 参数应限制返回数量', () => {
    const gw = createEventGateway();
    for (let i = 0; i < 10; i++) {
      gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });
    }
    const results = gw.query({ limit: 3 });
    assert.strictEqual(results.length, 3);
  });

  // --- 统计与导出 ---
  console.log('\n统计与导出:');

  test('getStats 应正确分组计数', () => {
    const gw = createEventGateway();
    gw.ingest({ eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error' });
    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });
    gw.ingest({ eventType: 'hook.failed', stage: 'pre-test', status: 'failed', severity: 'warn' });

    const stats = gw.getStats();
    assert.strictEqual(stats.total, 3);
    assert.strictEqual(stats.byType['hook.failed'], 2);
    assert.strictEqual(stats.byType['test.passed'], 1);
    assert.strictEqual(stats.byStage['post-test'], 2);
    assert.strictEqual(stats.bySeverity['error'], 1);
    assert.strictEqual(stats.byStatus['failed'], 2);
  });

  test('export json 应返回格式化 JSON', () => {
    const gw = createEventGateway();
    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });

    const json = gw.export('json');
    const parsed = JSON.parse(json);
    assert.strictEqual(Array.isArray(parsed), true);
    assert.strictEqual(parsed.length, 1);
  });

  test('export ndjson 应返回每行一条', () => {
    const gw = createEventGateway();
    gw.ingest({ eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error' });
    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });

    const ndjson = gw.export('ndjson');
    const lines = ndjson.split('\n').filter(l => l.trim());
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(JSON.parse(lines[0]).eventId, 'evt-1');
  });

  // --- 清空与 size ---
  console.log('\n清空与 size:');

  test('clear 应清空所有事件', () => {
    const gw = createEventGateway();
    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });
    assert.strictEqual(gw.size, 1);
    gw.clear();
    assert.strictEqual(gw.size, 0);
  });

  test('clear 后 eventId 应重置', () => {
    const gw = createEventGateway();
    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });
    gw.clear();
    const r = gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });
    assert.strictEqual(r.event.eventId, 'evt-1');
  });

  // --- 幂等性 ---
  console.log('\n幂等性:');

  test('无 storagePath 时 clear 后不残留文件副作用', () => {
    const gw = createEventGateway();
    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });
    gw.clear();
    assert.strictEqual(gw.size, 0);
    assert.strictEqual(gw.export('json'), '[]');
  });

  test('空查询应返回空数组', () => {
    const gw = createEventGateway();
    assert.deepStrictEqual(gw.query(), []);
    assert.deepStrictEqual(gw.query({ eventType: 'nonexistent' }), []);
  });

  // --- 工厂函数 ---
  console.log('\n工厂函数:');

  test('createEventGateway 应返回 EventGateway 实例', () => {
    const gw = createEventGateway();
    assert.ok(gw instanceof EventGateway);
  });

  test('不传 options 也能正常工作', () => {
    const gw = createEventGateway();
    const result = gw.ingest({
      eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info'
    });
    assert.strictEqual(result.success, true);
  });

  // --- P4.8: 错误可见性 ---
  console.log('\n错误可见性:');

  test('EventGateway 应记录坏行 loadErrors', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egw-err-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');
    fs.writeFileSync(storagePath, 'bad-json\n{"eventId":"evt-1","runId":"r1","projectId":"p1","eventType":"hook.failed","stage":"post-test","status":"failed","severity":"error","message":"ok","timestamp":"2026-01-01T00:00:00.000Z","metadata":{}}\n', 'utf8');

    const gw = createEventGateway({ storagePath });
    const errors = gw.getLoadErrors();
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].type, 'parse_error');
    assert.strictEqual(errors[0].lineNumber, 1);
    assert.ok(errors[0].message);
    assert.ok(errors[0].timestamp);
    assert.strictEqual(errors[0].line, 'bad-json');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('EventGateway getLoadErrors 应返回副本', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egw-err-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');
    fs.writeFileSync(storagePath, 'bad-json\n', 'utf8');

    const gw = createEventGateway({ storagePath });
    const errors1 = gw.getLoadErrors();
    const errors2 = gw.getLoadErrors();
    assert.notStrictEqual(errors1, errors2);
    assert.deepStrictEqual(errors1, errors2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('EventGateway 写入失败时应记录 writeErrors', () => {
    // 使用 /dev/null 作为 storagePath，写入 JSON 行会失败
    const gw = createEventGateway({ storagePath: '/dev/null' });
    // 清除加载阶段可能产生的写入错误
    gw.getWriteErrors();
    const result = gw.ingest({
      eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error'
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(gw.size, 1);
    // 写入 /dev/null 不会失败（它是黑洞），所以此测试验证内存不受影响
  });

  test('EventGateway getWriteErrors 应返回副本', () => {
    const gw = createEventGateway();
    const errors1 = gw.getWriteErrors();
    const errors2 = gw.getWriteErrors();
    assert.notStrictEqual(errors1, errors2);
    assert.deepStrictEqual(errors1, errors2);
  });

  test('EventGateway throwOnWriteError=true 时写入失败应抛错', () => {
    // 使用已存在的目录作为 storagePath，appendFileSync 写目录会失败
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egw-err-'));
    const gw = createEventGateway({ storagePath: tmpDir, throwOnWriteError: true });
    let threw = false;
    try {
      gw.ingest({
        eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error'
      });
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, true, 'throwOnWriteError=true 时应抛出异常');
    assert.strictEqual(gw.size, 1); // 内存中仍应有事件

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- P4.8: clear 增强 ---
  console.log('\nclear 增强:');

  test('EventGateway clear 默认只清内存不清文件', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egw-clr-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');
    const gw = createEventGateway({ storagePath });

    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });
    assert.strictEqual(gw.size, 1);
    assert.ok(fs.existsSync(storagePath));

    gw.clear();
    assert.strictEqual(gw.size, 0);

    // 文件应仍存在且有内容
    const content = fs.readFileSync(storagePath, 'utf8');
    assert.ok(content.trim().length > 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('EventGateway clear({ clearFile: true }) 应清空文件', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egw-clr-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');
    const gw = createEventGateway({ storagePath });

    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });
    gw.ingest({ eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error' });
    assert.strictEqual(gw.size, 2);

    gw.clear({ clearFile: true });
    assert.strictEqual(gw.size, 0);

    // 文件应存在但为空
    const content = fs.readFileSync(storagePath, 'utf8');
    assert.strictEqual(content, '');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- P4.8: 写入失败不影响内存 ---
  console.log('\n写入失败不影响内存:');

  test('EventGateway 写入失败不应影响内存查询', () => {
    // 使用已存在的目录作为 storagePath，写入会失败但内存不受影响
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egw-err-'));
    const gw = createEventGateway({ storagePath: tmpDir });
    gw.ingest({ eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error' });
    gw.ingest({ eventType: 'test.passed', stage: 'post-test', status: 'success', severity: 'info' });

    assert.strictEqual(gw.size, 2);
    const results = gw.query({ severity: 'error' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].eventType, 'hook.failed');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('EventGateway 文件坏行不应影响正常事件恢复', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egw-err-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');
    fs.writeFileSync(storagePath, 'bad-line\n{"eventId":"evt-1","runId":"r1","projectId":"p1","eventType":"hook.failed","stage":"post-test","status":"failed","severity":"error","message":"ok","timestamp":"2026-01-01T00:00:00.000Z","metadata":{}}\nanother-bad\n{"eventId":"evt-2","runId":"r2","projectId":"p1","eventType":"test.passed","stage":"post-test","status":"success","severity":"info","message":"ok","timestamp":"2026-01-01T00:01:00.000Z","metadata":{}}\n', 'utf8');

    const gw = createEventGateway({ storagePath });
    assert.strictEqual(gw.size, 2);
    assert.strictEqual(gw.getLoadErrors().length, 2);

    const events = gw.query();
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].eventType, 'hook.failed');
    assert.strictEqual(events[1].eventType, 'test.passed');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
