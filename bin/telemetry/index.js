'use strict';

// 对外唯一入口。任一模块加载失败都必须返回一个"透明 wrap"，调用方无感。
let impl = null;
try {
  // eslint-disable-next-line global-require
  impl = require('./aspect');
} catch (_error) {
  impl = null;
}

function transparent(_command, fn) {
  return typeof fn === 'function' ? fn() : undefined;
}

exports.wrap = function wrap(command, fn) {
  if (!impl || typeof impl.wrap !== 'function') {
    return transparent(command, fn);
  }
  try {
    return impl.wrap(command, fn);
  } catch (_error) {
    return transparent(command, fn);
  }
};
