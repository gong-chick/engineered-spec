'use strict';

const assert = require('node:assert');
const {
  AGENT_EVENT_TYPES,
  AgentVisual,
  createAgentVisual
} = require('../../src/visual/agent-visual');

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

function makeEvent(overrides = {}) {
  return {
    eventId: 'evt-1',
    runId: 'run-001',
    projectId: 'p1',
    eventType: 'agent.started',
    stage: 'pre-task',
    status: 'success',
    severity: 'info',
    message: '',
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides
  };
}

async function main() {
  console.log('\n=== Agent Visual 测试 ===\n');

  // --- Agent 时间线 ---
  console.log('Agent 时间线:');

  test('buildAgentTimeline 应构建 agent 列表', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({ eventType: 'agent.started', metadata: { agentId: 'coder', role: 'implementer' } }),
      makeEvent({ eventType: 'agent.completed', metadata: { agentId: 'coder' } })
    ];
    const tl = av.buildAgentTimeline(events);
    assert.strictEqual(tl.agents.length, 1);
    assert.strictEqual(tl.agents[0].agentId, 'coder');
    assert.strictEqual(tl.agents[0].status, 'completed');
  });

  test('agent.started 应记录开始时间', () => {
    const av = createAgentVisual();
    const ts = '2026-01-01T10:00:00.000Z';
    const events = [
      makeEvent({ eventType: 'agent.started', timestamp: ts, metadata: { agentId: 'a1' } })
    ];
    const tl = av.buildAgentTimeline(events);
    assert.strictEqual(tl.agents[0].startedAt, ts);
    assert.strictEqual(tl.agents[0].status, 'running');
  });

  test('agent.escalated 应标记为 escalated', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({ eventType: 'agent.started', metadata: { agentId: 'a1' } }),
      makeEvent({ eventType: 'agent.escalated', metadata: { agentId: 'a1' } })
    ];
    const tl = av.buildAgentTimeline(events);
    assert.strictEqual(tl.agents[0].status, 'escalated');
  });

  test('agent.blocked 应标记为 blocked', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({ eventType: 'agent.started', metadata: { agentId: 'a1' } }),
      makeEvent({ eventType: 'agent.blocked', metadata: { agentId: 'a1' } })
    ];
    const tl = av.buildAgentTimeline(events);
    assert.strictEqual(tl.agents[0].status, 'blocked');
  });

  test('多个 Agent 应独立分组', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({ eventType: 'agent.started', metadata: { agentId: 'coder' } }),
      makeEvent({ eventType: 'agent.started', metadata: { agentId: 'reviewer' } })
    ];
    const tl = av.buildAgentTimeline(events);
    assert.strictEqual(tl.agents.length, 2);
  });

  test('toolCalls 应从 metadata 读取', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({ eventType: 'agent.started', metadata: { agentId: 'a1', toolCalls: 15 } })
    ];
    const tl = av.buildAgentTimeline(events);
    assert.strictEqual(tl.agents[0].toolCalls, 15);
  });

  test('非 Agent 事件应被过滤', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({ eventType: 'hook.failed' }),
      makeEvent({ eventType: 'agent.started', metadata: { agentId: 'a1' } })
    ];
    const tl = av.buildAgentTimeline(events);
    assert.strictEqual(tl.agents.length, 1);
  });

  test('无 agentId 时应归入 unknown', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({ eventType: 'agent.started' })
    ];
    const tl = av.buildAgentTimeline(events);
    assert.strictEqual(tl.agents[0].agentId, 'run-001');
  });

  // --- Handoff 视图 ---
  console.log('\nHandoff 视图:');

  test('getHandoffView 应提取 handoff 事件', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({
        eventType: 'agent.handoff',
        message: '需要审查',
        metadata: { fromAgent: 'coder', toAgent: 'reviewer' }
      })
    ];
    const handoffs = av.getHandoffView(events);
    assert.strictEqual(handoffs.length, 1);
    assert.strictEqual(handoffs[0].fromAgent, 'coder');
    assert.strictEqual(handoffs[0].toAgent, 'reviewer');
    assert.strictEqual(handoffs[0].reason, '需要审查');
  });

  test('无 handoff 事件时应返回空数组', () => {
    const av = createAgentVisual();
    assert.deepStrictEqual(av.getHandoffView([]), []);
  });

  test('多个 handoff 应全部提取', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({ eventType: 'agent.handoff', metadata: { fromAgent: 'a', toAgent: 'b' } }),
      makeEvent({ eventType: 'agent.handoff', metadata: { fromAgent: 'b', toAgent: 'c' } })
    ];
    assert.strictEqual(av.getHandoffView(events).length, 2);
  });

  // --- 冲突视图 ---
  console.log('\n冲突视图:');

  test('getDisputeView 应提取 tool_denied 事件', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({
        eventType: 'agent.tool_denied',
        message: '无权执行 rm',
        metadata: { agentId: 'coder' }
      })
    ];
    const disputes = av.getDisputeView(events);
    assert.strictEqual(disputes.length, 1);
    assert.strictEqual(disputes[0].type, 'tool_denied');
    assert.strictEqual(disputes[0].agentId, 'coder');
  });

  test('getDisputeView 应提取 file_scope 事件', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({
        eventType: 'agent.file_scope',
        message: '越权访问 /etc/passwd',
        metadata: { agentId: 'coder' }
      })
    ];
    const disputes = av.getDisputeView(events);
    assert.strictEqual(disputes.length, 1);
    assert.strictEqual(disputes[0].type, 'file_scope');
  });

  test('getDisputeView 应提取 max_iterations 事件', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({
        eventType: 'agent.max_iterations',
        message: '超过最大迭代次数',
        metadata: { agentId: 'coder' }
      })
    ];
    const disputes = av.getDisputeView(events);
    assert.strictEqual(disputes.length, 1);
    assert.strictEqual(disputes[0].type, 'max_iterations');
  });

  test('无冲突事件时应返回空数组', () => {
    const av = createAgentVisual();
    assert.deepStrictEqual(av.getDisputeView([]), []);
  });

  // --- 人工门禁视图 ---
  console.log('\n人工门禁视图:');

  test('getHumanGateView 应提取门禁事件', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({
        eventType: 'agent.human_gate',
        message: '请确认部署',
        metadata: { agentId: 'deployer', gateId: 'gate-001', decision: 'approved' }
      })
    ];
    const gates = av.getHumanGateView(events);
    assert.strictEqual(gates.length, 1);
    assert.strictEqual(gates[0].gateId, 'gate-001');
    assert.strictEqual(gates[0].decision, 'approved');
    assert.strictEqual(gates[0].reason, '请确认部署');
  });

  test('decision 默认应为 pending', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({
        eventType: 'agent.human_gate',
        metadata: { agentId: 'a1' }
      })
    ];
    const gates = av.getHumanGateView(events);
    assert.strictEqual(gates[0].decision, 'pending');
  });

  test('无门禁事件时应返回空数组', () => {
    const av = createAgentVisual();
    assert.deepStrictEqual(av.getHumanGateView([]), []);
  });

  test('null 输入应返回空数组', () => {
    const av = createAgentVisual();
    assert.deepStrictEqual(av.getHandoffView(null), []);
    assert.deepStrictEqual(av.getDisputeView(null), []);
    assert.deepStrictEqual(av.getHumanGateView(null), []);
  });

  // --- buildAgentTimeline 集成 ---
  console.log('\nbuildAgentTimeline 集成:');

  test('应同时返回 agents、handoffs、disputes、humanGates', () => {
    const av = createAgentVisual();
    const events = [
      makeEvent({ eventType: 'agent.started', metadata: { agentId: 'coder' } }),
      makeEvent({ eventType: 'agent.handoff', metadata: { fromAgent: 'coder', toAgent: 'reviewer' } }),
      makeEvent({ eventType: 'agent.tool_denied', metadata: { agentId: 'coder' } }),
      makeEvent({ eventType: 'agent.human_gate', metadata: { agentId: 'coder', decision: 'approved' } })
    ];
    const tl = av.buildAgentTimeline(events);
    assert.ok(Array.isArray(tl.agents));
    assert.ok(Array.isArray(tl.handoffs));
    assert.ok(Array.isArray(tl.disputes));
    assert.ok(Array.isArray(tl.humanGates));
    assert.strictEqual(tl.handoffs.length, 1);
    assert.strictEqual(tl.disputes.length, 1);
    assert.strictEqual(tl.humanGates.length, 1);
  });

  // --- 工厂函数 ---
  console.log('\n工厂函数:');

  test('createAgentVisual 应返回 AgentVisual 实例', () => {
    const av = createAgentVisual();
    assert.ok(av instanceof AgentVisual);
  });

  console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
