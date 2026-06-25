const { ExecutorError } = require('./types');

function withExecutorTimeout(taskFactory, timeoutMs) {
  const effectiveTimeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 10 * 60 * 1000;
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new ExecutorError(
        'EXECUTOR_TIMEOUT',
        `执行器执行超时，已超过 ${effectiveTimeout}ms。`,
        '请缩小任务范围，或提高 timeoutMs 后重试。'
      ));
    }, effectiveTimeout);

    Promise.resolve()
      .then(taskFactory)
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

module.exports = {
  withExecutorTimeout,
};
