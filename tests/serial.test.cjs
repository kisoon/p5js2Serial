const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Serial, LineSplitter } = require('../lib/p5.serial2.js');

function fixture(options = {}, sink = {}) {
  const sent = [];
  const writable = new WritableStream({
    write(bytes) {
      sent.push(new TextDecoder().decode(bytes));
      return sink.write?.(bytes);
    }
  });
  const serial = new Serial({ bootDelay: 0, ...options });
  serial.port = { writable, close: async () => {} };
  serial.state = 'open';
  serial._writesAllowedAt = Date.now() + serial.options.bootDelay;
  return { serial, sent };
}

test('awaited consecutive writes complete without another enqueue', { timeout: 2000 }, async () => {
  const { serial, sent } = fixture();
  for (let i = 0; i < 100; i++) assert.equal(await serial.println(i), true);
  await serial.close();
  assert.deepEqual(sent, Array.from({ length: 100 }, (_, i) => `${i}\n`));
  assert.equal(serial.isBusy(), false);
});

test('close drains accepted writes after boot delay and rejects new writes', async () => {
  const { serial, sent } = fixture({ bootDelay: 40 });
  const pending = [serial.println('one'), serial.println('two')];
  const closing = serial.close();
  assert.equal(await serial.println('late'), false);
  await closing;
  assert.deepEqual(await Promise.all(pending), [true, true]);
  assert.deepEqual(sent, ['one\n', 'two\n']);
  assert.equal(serial.state, 'closed');
});

test('close drains a write enqueued at the pump completion boundary', async () => {
  const { serial, sent } = fixture();
  await serial.println('one');
  const second = serial.println('two');
  await serial.close();
  assert.equal(await second, true);
  assert.deepEqual(sent, ['one\n', 'two\n']);
});

test('write failure resolves accepted promises as false', async () => {
  const { serial } = fixture({}, { write: () => Promise.reject(new Error('device lost')) });
  const pending = [serial.println('one'), serial.println('two')];
  assert.deepEqual(await Promise.all(pending), [false, false]);
  await serial.close();
});

test('close cancels queued data after the drain deadline', { timeout: 4000 }, async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const { serial, sent } = fixture({}, { write: () => blocked });
  const first = serial.println('one');
  const second = serial.println('two');
  // A slow sink remains busy past the 1s drain deadline, then settles.
  const timer = setTimeout(release, 1150);
  await serial.close();
  clearTimeout(timer);
  assert.equal(await second, false);
  await first;
  assert.deepEqual(sent, ['one\n']);
  assert.equal(serial.state, 'closed');
});

test('UTF-8 and CRLF may be split between incoming chunks', () => {
  const splitter = new LineSplitter('utf-8');
  const bytes = new TextEncoder().encode('한글\r\n');
  assert.deepEqual(splitter.push(bytes.slice(0, 2)), []);
  assert.deepEqual(splitter.push(bytes.slice(2, -1)), []);
  assert.deepEqual(splitter.push(bytes.slice(-1)), ['한글']);
});

test('queue overflow reports false while accepted data keeps its order', async () => {
  const { serial, sent } = fixture({ maxWriteQueue: 4, bootDelay: 20 });
  const first = serial.println('abc');
  assert.equal(await serial.println('extra'), false);
  assert.equal(await first, true);
  await serial.close();
  assert.deepEqual(sent, ['abc\n']);
});

test('stalled write cannot keep close pending; late cleanup safely finishes', { timeout: 4000 }, async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const { serial } = fixture({}, { write: () => blocked });
  const errors = [];
  serial.on('error', e => errors.push(e.name));
  const writing = serial.println('blocked');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(await serial.close(), false);
  assert.equal(await writing, false);
  assert.equal(serial.state, 'closing');
  assert.deepEqual(errors, ['TimeoutError']);
  assert.equal(await serial._openPort({}), false);
  release();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(serial.state, 'closed');
});

test('close cancels pending open and closes the late port without connect', { timeout: 2000 }, async () => {
  const serial = new Serial({ bootDelay: 0 });
  let finishOpen;
  let closed = 0;
  let connected = 0;
  serial.on('connect', () => connected++);
  const port = {
    readable: null,
    open: () => new Promise(resolve => { finishOpen = resolve; }),
    close: async () => { closed++; }
  };
  const opening = serial._openPort(port);
  const closing = serial.close();
  finishOpen();
  assert.equal(await opening, false);
  assert.equal(await closing, true);
  assert.equal(serial.state, 'closed');
  assert.equal(closed, 1);
  assert.equal(connected, 0);
});

test('pending port open also has bounded close wait', { timeout: 2000 }, async () => {
  const serial = new Serial();
  let finishOpen;
  let closed = 0;
  const opening = serial._openPort({
    readable: null,
    open: () => new Promise(resolve => { finishOpen = resolve; }),
    close: async () => { closed++; }
  });
  assert.equal(await serial.close(), false);
  assert.equal(serial.state, 'closing');
  finishOpen();
  assert.equal(await opening, false);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(serial.state, 'closed');
  assert.equal(closed, 1);
});
