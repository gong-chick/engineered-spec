'use strict';

const visualConfig = require('./visual-config');
const visualClient = require('./visual-client');
const visualReporter = require('./visual-reporter');
const eventMapper = require('./event-mapper');
const privacyFilter = require('./privacy-filter');
const eventGateway = require('./event-gateway');
const timeline = require('./timeline');
const hookDashboard = require('./hook-dashboard');
const agentVisual = require('./agent-visual');
const metrics = require('./metrics');
const riskBoard = require('./risk-board');

module.exports = {
  ...visualConfig,
  ...visualClient,
  ...visualReporter,
  ...eventMapper,
  ...privacyFilter,
  ...eventGateway,
  ...timeline,
  ...hookDashboard,
  ...agentVisual,
  ...metrics,
  ...riskBoard
};
