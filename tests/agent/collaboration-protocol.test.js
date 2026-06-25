/**
 * Collaboration Protocol 测试
 */

const assert = require('assert');

const { createAgentProfile } = require('../../src/agent/agent-profile');
const { AGENT_STATES } = require('../../src/agent/agent-types');
const { AgentState, AgentCollaborationProtocol, STATE_TRANSITIONS } = require('../../src/agent/collaboration-protocol');

// ============================================================
// AgentState 测试
// ============================================================

async function testAgentStateInitial() {
  console.log('  TC01: AgentState 初始状态为 idle');
  const state = new AgentState('agent-1');
  assert.strictEqual(state.state, AGENT_STATES.IDLE);
  assert.strictEqual(state.taskId, null);
  assert.strictEqual(state.isTerminal(), false);
}

async function testAgentStateTransitionIdleToAssigned() {
  console.log('  TC02: idle → assigned 转换');
  const state = new AgentState('agent-1');
  const result = state.transition(AGENT_STATES.ASSIGNED, '分配任务');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(state.state, AGENT_STATES.ASSIGNED);
  assert.strictEqual(state.history.length, 1);
  assert.strictEqual(state.history[0].from, AGENT_STATES.IDLE);
  assert.strictEqual(state.history[0].to, AGENT_STATES.ASSIGNED);
}

async function testAgentStateTransitionAssignedToExecuting() {
  console.log('  TC03: assigned → executing 转换');
  const state = new AgentState('agent-1');
  state.transition(AGENT_STATES.ASSIGNED);
  const result = state.transition(AGENT_STATES.EXECUTING);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(state.state, AGENT_STATES.EXECUTING);
  assert.ok(state.startedAt);
}

async function testAgentStateInvalidTransition() {
  console.log('  TC04: 非法状态转换被拒绝');
  const state = new AgentState('agent-1');
  const result = state.transition(AGENT_STATES.COMPLETED);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('不允许'));
  assert.strictEqual(state.state, AGENT_STATES.IDLE);
}

async function testAgentStateInvalidState() {
  console.log('  TC05: 非法状态值被拒绝');
  const state = new AgentState('agent-1');
  const result = state.transition('nonexistent');
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('非法'));
}

async function testAgentStateTerminal() {
  console.log('  TC06: 终态判断正确');
  const completedState = new AgentState('agent-1');
  completedState.transition(AGENT_STATES.ASSIGNED);
  completedState.transition(AGENT_STATES.EXECUTING);
  completedState.transition(AGENT_STATES.COMPLETED);
  assert.strictEqual(completedState.isTerminal(), true);

  const failedState = new AgentState('agent-2');
  failedState.transition(AGENT_STATES.ASSIGNED);
  failedState.transition(AGENT_STATES.EXECUTING);
  failedState.transition(AGENT_STATES.FAILED);
  assert.strictEqual(failedState.isTerminal(), true);
}

async function testAgentStateReset() {
  console.log('  TC07: AgentState 重置');
  const state = new AgentState('agent-1');
  state.transition(AGENT_STATES.ASSIGNED);
  state.taskId = 'task-1';
  state.reset();
  assert.strictEqual(state.state, AGENT_STATES.IDLE);
  assert.strictEqual(state.taskId, null);
}

async function testAgentStateFullLifecycle() {
  console.log('  TC08: Agent 完整生命周期 idle→assigned→executing→reviewing→completed');
  const state = new AgentState('agent-1');
  assert.strictEqual(state.transition(AGENT_STATES.ASSIGNED).ok, true);
  assert.strictEqual(state.transition(AGENT_STATES.EXECUTING).ok, true);
  assert.strictEqual(state.transition(AGENT_STATES.REVIEWING).ok, true);
  assert.strictEqual(state.transition(AGENT_STATES.COMPLETED).ok, true);
  assert.strictEqual(state.state, AGENT_STATES.COMPLETED);
  assert.strictEqual(state.isTerminal(), true);
}

async function testAgentStateRepairCycle() {
  console.log('  TC09: Agent 修复循环 executing→reviewing→repairing→executing');
  const state = new AgentState('agent-1');
  state.transition(AGENT_STATES.ASSIGNED);
  state.transition(AGENT_STATES.EXECUTING);
  assert.strictEqual(state.transition(AGENT_STATES.REVIEWING).ok, true);
  assert.strictEqual(state.transition(AGENT_STATES.REPAIRING).ok, true);
  assert.strictEqual(state.transition(AGENT_STATES.EXECUTING).ok, true);
  assert.strictEqual(state.state, AGENT_STATES.EXECUTING);
}

// ============================================================
// AgentCollaborationProtocol 测试
// ============================================================

async function testProtocolRegisterAgent() {
  console.log('  TC10: 注册 Agent');
  const protocol = new AgentCollaborationProtocol();
  const profile = createAgentProfile({ agentId: 'agent-1', name: '测试 Agent' });
  const agentState = protocol.registerAgent(profile);
  assert.strictEqual(agentState.agentId, 'agent-1');
  assert.strictEqual(protocol.agents.size, 1);
}

async function testProtocolUnregisterAgent() {
  console.log('  TC11: 注销 Agent');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  assert.strictEqual(protocol.unregisterAgent('agent-1'), true);
  assert.strictEqual(protocol.agents.size, 0);
  assert.strictEqual(protocol.unregisterAgent('nonexistent'), false);
}

async function testProtocolAssignTask() {
  console.log('  TC12: 分配任务');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  const result = protocol.assignTask('agent-1', 'task-1');
  assert.strictEqual(result.ok, true);
  const agentState = protocol.getAgentState('agent-1');
  assert.strictEqual(agentState.state, AGENT_STATES.ASSIGNED);
  assert.strictEqual(agentState.taskId, 'task-1');
}

async function testProtocolAssignTaskToBusyAgent() {
  console.log('  TC13: 向忙碌 Agent 分配任务被拒绝');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  protocol.assignTask('agent-1', 'task-1');
  const result = protocol.assignTask('agent-1', 'task-2');
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('当前状态'));
}

async function testProtocolAssignDuplicateTask() {
  console.log('  TC14: 重复分配任务被拒绝');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-2', name: 'test2' }));
  protocol.assignTask('agent-1', 'task-1');
  const result = protocol.assignTask('agent-2', 'task-1');
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('已分配'));
}

async function testProtocolAssignToNonexistent() {
  console.log('  TC15: 向不存在的 Agent 分配任务被拒绝');
  const protocol = new AgentCollaborationProtocol();
  const result = protocol.assignTask('nonexistent', 'task-1');
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('不存在'));
}

async function testProtocolReleaseTask() {
  console.log('  TC16: 释放任务');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  protocol.assignTask('agent-1', 'task-1');
  const result = protocol.releaseTask('task-1');
  assert.strictEqual(result.ok, true);
  const agentState = protocol.getAgentState('agent-1');
  assert.strictEqual(agentState.state, AGENT_STATES.IDLE);
  assert.strictEqual(agentState.taskId, null);
}

async function testProtocolReleaseUnassignedTask() {
  console.log('  TC17: 释放未分配任务被拒绝');
  const protocol = new AgentCollaborationProtocol();
  const result = protocol.releaseTask('nonexistent');
  assert.strictEqual(result.ok, false);
}

async function testProtocolSendMessage() {
  console.log('  TC18: 发送消息');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-2', name: 'test2' }));
  const msg = protocol.sendMessage({
    fromAgentId: 'agent-1',
    toAgentId: 'agent-2',
    type: 'task',
    payload: { taskId: 'task-1' },
  });
  assert.ok(msg.id);
  assert.strictEqual(msg.fromAgentId, 'agent-1');
  assert.strictEqual(msg.toAgentId, 'agent-2');
  assert.strictEqual(msg.read, false);
}

async function testProtocolGetUnreadMessages() {
  console.log('  TC19: 获取未读消息');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-2', name: 'test2' }));
  protocol.sendMessage({ fromAgentId: 'agent-1', toAgentId: 'agent-2', type: 'task', payload: {} });
  protocol.sendMessage({ fromAgentId: 'agent-1', toAgentId: 'agent-2', type: 'review', payload: {} });

  const unread = protocol.getUnreadMessages('agent-2');
  assert.strictEqual(unread.length, 2);
  assert.deepStrictEqual(protocol.getUnreadMessages('agent-1'), []);
}

async function testProtocolMarkMessageRead() {
  console.log('  TC20: 标记消息已读');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-2', name: 'test2' }));
  const msg = protocol.sendMessage({ fromAgentId: 'agent-1', toAgentId: 'agent-2', type: 'task', payload: {} });

  assert.strictEqual(protocol.markMessageRead(msg.id), true);
  assert.strictEqual(protocol.getUnreadMessages('agent-2').length, 0);
  assert.strictEqual(protocol.markMessageRead('nonexistent'), false);
}

async function testProtocolListAgents() {
  console.log('  TC21: 列出所有 Agent');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-2', name: 'test2' }));
  const list = protocol.listAgents();
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].state, AGENT_STATES.IDLE);
}

async function testProtocolGetIdleAgents() {
  console.log('  TC22: 获取空闲 Agent');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-2', name: 'test2' }));
  protocol.assignTask('agent-1', 'task-1');
  const idle = protocol.getIdleAgents();
  assert.strictEqual(idle.length, 1);
  assert.strictEqual(idle[0].agentId, 'agent-2');
}

async function testProtocolStats() {
  console.log('  TC23: 协议统计');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-2', name: 'test2' }));
  protocol.assignTask('agent-1', 'task-1');
  protocol.sendMessage({ fromAgentId: 'agent-1', toAgentId: 'agent-2', type: 'task', payload: {} });

  const stats = protocol.getStats();
  assert.strictEqual(stats.totalAgents, 2);
  assert.strictEqual(stats.totalTasks, 1);
  assert.strictEqual(stats.totalMessages, 1);
  assert.strictEqual(stats.byState[AGENT_STATES.ASSIGNED], 1);
  assert.strictEqual(stats.byState[AGENT_STATES.IDLE], 1);
}

async function testProtocolReset() {
  console.log('  TC24: 协议重置');
  const protocol = new AgentCollaborationProtocol();
  protocol.registerAgent(createAgentProfile({ agentId: 'agent-1', name: 'test' }));
  protocol.assignTask('agent-1', 'task-1');
  protocol.sendMessage({ fromAgentId: 'agent-1', toAgentId: 'agent-1', type: 'task', payload: {} });

  protocol.reset();
  const agentState = protocol.getAgentState('agent-1');
  assert.strictEqual(agentState.state, AGENT_STATES.IDLE);
  assert.deepStrictEqual(protocol.getUnreadMessages('agent-1'), []);
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== collaboration-protocol.test.js ===');

  const tests = [
    testAgentStateInitial,
    testAgentStateTransitionIdleToAssigned,
    testAgentStateTransitionAssignedToExecuting,
    testAgentStateInvalidTransition,
    testAgentStateInvalidState,
    testAgentStateTerminal,
    testAgentStateReset,
    testAgentStateFullLifecycle,
    testAgentStateRepairCycle,
    testProtocolRegisterAgent,
    testProtocolUnregisterAgent,
    testProtocolAssignTask,
    testProtocolAssignTaskToBusyAgent,
    testProtocolAssignDuplicateTask,
    testProtocolAssignToNonexistent,
    testProtocolReleaseTask,
    testProtocolReleaseUnassignedTask,
    testProtocolSendMessage,
    testProtocolGetUnreadMessages,
    testProtocolMarkMessageRead,
    testProtocolListAgents,
    testProtocolGetIdleAgents,
    testProtocolStats,
    testProtocolReset,
  ];

  let passed = 0;
  let failed = 0;

  for (const testFn of tests) {
    try {
      await testFn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${testFn.name} — ${err.message}`);
    }
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败, 共 ${tests.length} 个`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
