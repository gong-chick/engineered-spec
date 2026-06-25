const { CodexExecutorProvider } = require('./providers/codex-executor-provider');
const { CursorExecutorProvider } = require('./providers/cursor-executor-provider');
const { ClaudeCodeExecutorProvider } = require('./providers/claude-code-executor-provider');

class ExecutorRegistry {
  constructor(options = {}) {
    this.providers = new Map();
    const providers = Object.prototype.hasOwnProperty.call(options, 'providers')
      ? options.providers
      : [
        new CodexExecutorProvider(),
        new CursorExecutorProvider(),
        new ClaudeCodeExecutorProvider(),
      ];
    for (const provider of providers || []) {
      this.register(provider);
    }
  }

  register(provider) {
    if (!provider || !provider.name) {
      throw new Error('执行器注册失败：Provider 缺少 name。');
    }
    this.providers.set(provider.name, provider);
    return provider;
  }

  get(name) {
    return this.providers.get(name) || null;
  }

  has(name) {
    return this.providers.has(name);
  }

  list() {
    return Array.from(this.providers.values()).map((provider) => ({
      name: provider.name,
      displayName: provider.displayName,
      capabilities: provider.capabilities || [],
      provider,
    }));
  }

  async getAvailableProviders(input = {}) {
    const available = [];
    const unavailable = [];
    for (const provider of this.providers.values()) {
      try {
        const availability = await provider.checkAvailability(input);
        if (availability.available) {
          available.push({ provider, availability });
        } else {
          unavailable.push({
            name: provider.name,
            displayName: provider.displayName,
            reason: availability.reason || '执行器不可用。',
            fixSuggestion: availability.fixSuggestion || null,
            version: availability.version || null,
          });
        }
      } catch (error) {
        unavailable.push({
          name: provider.name,
          displayName: provider.displayName,
          reason: `执行器可用性检查失败：${error.message}`,
          fixSuggestion: '请检查执行器安装状态，或切换其他执行器。',
          version: null,
        });
      }
    }
    return { available, unavailable };
  }
}

module.exports = {
  ExecutorRegistry,
};
