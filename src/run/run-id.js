const crypto = require('crypto');

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

class RunIdGenerator {
  generate(requirementText = '', date = new Date()) {
    const hash = crypto.createHash('sha256')
      .update(`${requirementText}-${date.getTime()}-${Math.random()}`)
      .digest('hex')
      .slice(0, 6);
    return `run-${formatTimestamp(date)}-${hash}`;
  }
}

module.exports = {
  RunIdGenerator,
  formatTimestamp,
};
