'use strict';

/** Calendar day YYYY-MM-DD in Asia/Shanghai. */
function shanghaiDayStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Ms at start of Shanghai calendar day. */
function shanghaiDayStartMs(dayStr) {
  return Date.parse(String(dayStr) + 'T00:00:00+08:00');
}

function shanghaiDayEndMs(dayStr) {
  return shanghaiDayStartMs(dayStr) + 86400e3 - 1;
}

function shanghaiNowLabel(d = new Date()) {
  const p = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t) => (p.find((x) => x.type === t) || {}).value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
}

module.exports = {
  shanghaiDayStr,
  shanghaiDayStartMs,
  shanghaiDayEndMs,
  shanghaiNowLabel,
};
