'use strict';

/**
 * AgentVisual — Agent 协作可视化
 * 展示 Agent 调用、handoff、冲突、人工门禁和结论
 */

const AGENT_EVENT_TYPES = [
  'agent.started', 'agent.completed', 'agent.escalated', 'agent.blocked',
  'agent.handoff', 'agent.tool_denied', 'agent.file_scope', 'agent.max_iterations',
  'agent.human_gate'
];

class AgentVisual {
  /**
   * 构建 Agent 时间线
   * @param {object[]} events
   * @returns {object}
   */
  buildAgentTimeline(events) {
    const all = (events || []).filter(e => AGENT_EVENT_TYPES.includes(e.eventType));
    const agentMap = new Map();

    for (const e of all) {
      const agentId = e.metadata?.agentId || e.runId || 'unknown';
      if (!agentMap.has(agentId)) {
        agentMap.set(agentId, {
          agentId,
          role: e.metadata?.role || 'agent',
          events: [],
          startedAt: null,
          completedAt: null,
          toolCalls: 0,
          status: 'completed'
        });
      }
      const agent = agentMap.get(agentId);
      agent.events.push(e);

      if (e.eventType === 'agent.started') {
        agent.startedAt = e.timestamp;
        agent.status = 'running';
      }
      if (e.eventType === 'agent.completed') {
        agent.completedAt = e.timestamp;
        agent.status = 'completed';
      }
      if (e.eventType === 'agent.escalated') {
        agent.status = 'escalated';
      }
      if (e.eventType === 'agent.blocked') {
        agent.status = 'blocked';
      }
      if (e.metadata?.toolCalls) {
        agent.toolCalls = e.metadata.toolCalls;
      }
    }

    return {
      agents: Array.from(agentMap.values()).map(a => ({
        agentId: a.agentId,
        role: a.role,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        toolCalls: a.toolCalls,
        status: a.status,
        eventCount: a.events.length
      })),
      handoffs: this.getHandoffView(events),
      disputes: this.getDisputeView(events),
      humanGates: this.getHumanGateView(events)
    };
  }

  /**
   * 获取 handoff 视图（Agent 间交接）
   * @param {object[]} events
   * @returns {object[]}
   */
  getHandoffView(events) {
    return (events || [])
      .filter(e => e.eventType === 'agent.handoff')
      .map(e => ({
        fromAgent: e.metadata?.fromAgent || 'unknown',
        toAgent: e.metadata?.toAgent || 'unknown',
        reason: e.message || '',
        timestamp: e.timestamp
      }));
  }

  /**
   * 获取冲突视图（权限冲突/工具拒绝）
   * @param {object[]} events
   * @returns {object[]}
   */
  getDisputeView(events) {
    return (events || [])
      .filter(e =>
        e.eventType === 'agent.tool_denied' ||
        e.eventType === 'agent.file_scope' ||
        e.eventType === 'agent.max_iterations'
      )
      .map(e => ({
        agentId: e.metadata?.agentId || 'unknown',
        type: e.eventType.replace('agent.', ''),
        detail: e.message || '',
        timestamp: e.timestamp
      }));
  }

  /**
   * 获取人工门禁视图
   * @param {object[]} events
   * @returns {object[]}
   */
  getHumanGateView(events) {
    return (events || [])
      .filter(e => e.eventType === 'agent.human_gate')
      .map(e => ({
        gateId: e.metadata?.gateId || e.eventId,
        agentId: e.metadata?.agentId || 'unknown',
        reason: e.message || '',
        decision: e.metadata?.decision || 'pending',
        timestamp: e.timestamp
      }));
  }
}

/**
 * 工厂函数
 * @param {object} [options]
 * @returns {AgentVisual}
 */
function createAgentVisual(options = {}) {
  return new AgentVisual(options);
}

module.exports = {
  AGENT_EVENT_TYPES,
  AgentVisual,
  createAgentVisual
};
