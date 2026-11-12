/*!
 * p5.serial2 v0.1.2
 * Arduino <-> p5.js serial communication over the Web Serial API.
 * Works in Chromium browsers (Chrome, Edge, Brave, Opera) — no extra app needed.
 * Built for p5.js 2.x (p5.registerAddon), with a fallback for p5.js 1.x.
 * License: MIT
 */
(function (root) {
  'use strict';

  const TAG = '[p5.serial2]';
  const VERSION = '0.1.2';

  // USB vendor IDs of Arduino boards and the USB-serial chips used by clones.
  const ARDUINO_FILTERS = [
    { usbVendorId: 0x2341 }, // Arduino (Uno, Mega, Leonardo ...)
    { usbVendorId: 0x2a03 }, // Arduino.org
    { usbVendorId: 0x1a86 }, // WCH CH340/CH341 (most Uno clones)
    { usbVendorId: 0x0403 }, // FTDI
    { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
  ];

  // Errors after which the port is still usable (Web Serial spec).
  const RECOVERABLE_ERRORS = ['BufferOverrunError', 'BreakError', 'FramingError', 'ParityError'];

  const DEFAULTS = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
    bufferSize: 4096, // size of the browser's read buffer
    filters: null, // null = show every port; 'arduino' = only Arduino-like boards; or an array
    bootDelay: 1600, // ms to hold writes after opening (Uno reboots when the port opens)
    maxBuffer: 65536, // max unread bytes kept; oldest bytes are dropped beyond this
    maxWriteQueue: 4096, // max bytes waiting to be sent; extra writes are dropped
    autoReconnect: true, // reopen automatically when the same board is plugged back in
    encoding: 'utf-8',
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  function warnUnsupported() {
    let msg = `${TAG} 이 브라우저는 Web Serial API를 지원하지 않습니다. Chrome / Edge / Brave(데스크톱)를 사용하세요.`;
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      msg += ' 또한 페이지가 https:// 또는 http://localhost 에서 열려야 합니다.';
    }
    console.warn(msg);
  }

  // ---------------------------------------------------------------------------
  // ByteQueue: growable FIFO of bytes without O(n) shifts.
  // ---------------------------------------------------------------------------
  class ByteQueue {
    constructor(capacity = 1024) {
      this.buf = new Uint8Array(capacity);
      this.start = 0;
      this.end = 0;
    }
    get length() {
      return this.end - this.start;
    }
    push(chunk) {
      const n = chunk.length;
      if (this.end + n > this.buf.length) {
        const len = this.length;
        if (len + n <= this.buf.length >> 1) {
          this.buf.copyWithin(0, this.start, this.end);
        } else {
          let cap = this.buf.length * 2;
          while (cap < len + n) cap *= 2;
          const next = new Uint8Array(cap);
          next.set(this.buf.subarray(this.start, this.end));
          this.buf = next;
        }
        this.start = 0;
        this.end = len;
      }
      this.buf.set(chunk, this.end);
      this.end += n;
    }
    indexOf(byte) {
      for (let i = this.start; i < this.end; i++) {
        if (this.buf[i] === byte) return i - this.start;
      }
      return -1;
    }
    indexOfSeq(seq) {
      if (seq.length === 1) return this.indexOf(seq[0]);
      outer: for (let i = this.start; i <= this.end - seq.length; i++) {
        for (let j = 0; j < seq.length; j++) {
          if (this.buf[i + j] !== seq[j]) continue outer;
        }
        return i - this.start;
      }
      return -1;
    }
    peek(i = 0) {
      return i < this.length ? this.buf[this.start + i] : -1;
    }
    take(n) {
      n = Math.min(n, this.length);
      const out = this.buf.slice(this.start, this.start + n);
      this.start += n;
      if (this.start === this.end) this.start = this.end = 0;
      return out;
    }
    drop(n) {
      this.start += Math.min(n, this.length);
      if (this.start === this.end) this.start = this.end = 0;
    }
    clear() {
      this.start = this.end = 0;
    }
  }

  // Splits a byte stream into text lines (handles \n and \r\n, multi-byte UTF-8).
  class LineSplitter {
    constructor(encoding) {
      this.decoder = new TextDecoder(encoding);
      this.partial = '';
    }
    push(bytes) {
      this.partial += this.decoder.decode(bytes, { stream: true });
      if (this.partial.indexOf('\n') === -1) {
        // Guard against a device that never sends a newline.
        if (this.partial.length > 65536) this.partial = this.partial.slice(-1024);
        return [];
      }
      const parts = this.partial.split('\n');
      this.partial = parts.pop();
      return parts.map((s) => (s.endsWith('\r') ? s.slice(0, -1) : s));
    }
    reset() {
      this.decoder = new TextDecoder(this.decoder.encoding);
      this.partial = '';
    }
  }

  function parseNumbers(line, sep) {
    if (line == null) return [];
    const parts = sep === undefined ? line.split(/[\s,;\t]+/) : line.split(sep);
    const out = [];
    for (const p of parts) {
      if (p.trim() === '') continue;
      out.push(Number(p));
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Serial
  // ---------------------------------------------------------------------------
  const allSerials = new Set();

  class Serial {
    constructor(options = {}) {
      this.options = Object.assign({}, DEFAULTS, options);
      this.port = null;
      this.state = 'closed'; // 'closed' | 'opening' | 'open' | 'closing'

      this._in = new ByteQueue();
      this._lines = new LineSplitter(this.options.encoding);
      this._strDecoder = new TextDecoder(this.options.encoding);
      this._encoder = new TextEncoder();
      this._lastLine = null;
      this._lineCount = 0;

      this._reader = null;
      this._readLoopDone = null;
      this._closing = false;

      this._out = []; // [{ bytes, resolve }]
      this._outBytes = 0;
      this._pumpDone = null;
      this._writesAllowedAt = 0;
      this._warnedFull = false;

      this._listeners = {};
      this._lostPortInfo = null;

      if (isSupported()) {
        this._onUsbConnect = (e) => this._handleUsbConnect(e);
        this._onUsbDisconnect = (e) => this._handleUsbDisconnect(e);
        navigator.serial.addEventListener('connect', this._onUsbConnect);
        navigator.serial.addEventListener('disconnect', this._onUsbDisconnect);
      }
      allSerials.add(this);
    }

    static isSupported() {
      return isSupported();
    }

    // ------------------------------------------------------------ connection

    /**
     * Ask the user to pick a port and open it.
     * Must be called from a user action (mousePressed, keyPressed, button click)
     * the first time, because the browser shows a port chooser.
     *   serial.open()                 // 9600 baud
     *   serial.open(115200)
     *   serial.open({ baudRate: 115200, filters: 'arduino' })
     */
    async open(arg) {
      if (!isSupported()) {
        warnUnsupported();
        return false;
      }
      if (typeof arg === 'number') this.options.baudRate = arg;
      else if (arg && typeof arg === 'object') Object.assign(this.options, arg);

      if (this.state === 'open' || this.state === 'opening') return this.state === 'open';

      let port;
      try {
        const req = {};
        const filters = this._resolveFilters();
        if (filters) req.filters = filters;
        port = await navigator.serial.requestPort(req);
      } catch (err) {
        if (err && err.name === 'NotFoundError') {
          console.info(`${TAG} 포트 선택이 취소되었습니다.`);
        } else if (err && err.name === 'SecurityError') {
          console.error(
            `${TAG} open()은 사용자 동작(mousePressed, keyPressed, 버튼 클릭 등) 안에서 호출해야 합니다. ` +
              `페이지를 열자마자 연결하려면 autoConnect()를 사용하세요.`
          );
        } else {
          console.error(TAG, err);
        }
        this._emit('error', err);
        return false;
      }
      return this._openPort(port);
    }

    /**
     * Reconnect to a port the user already allowed before, without a chooser.
     * Safe to call in setup(). Resolves to true if a port was opened.
     */
    async autoConnect(arg) {
      if (!isSupported()) {
        warnUnsupported();
        return false;
      }
      if (typeof arg === 'number') this.options.baudRate = arg;
      else if (arg && typeof arg === 'object') Object.assign(this.options, arg);
      if (this.state === 'open' || this.state === 'opening') return this.state === 'open';

      const ports = await navigator.serial.getPorts();
      const filters = this._resolveFilters();
      const candidates = ports.filter((p) => !p.readable && matchesFilters(p, filters));
      for (const port of candidates) {
        if (await this._openPort(port)) return true;
      }
      return false;
    }

    async close() {
      if (this.state === 'closed' || this.state === 'closing') return;
      this.state = 'closing';
      this._closing = true;
      this._lostPortInfo = null; // a manual close disables auto-reconnect

      // Reject new writes, but drain accepted writes after the boot delay.
      // Bound the additional drain time if the device stops accepting data.
      const drainTimeout = Math.max(0, this._writesAllowedAt - Date.now()) + 1000;
      if (this._out.length && !this._pumpDone) this._startPump();
      if (this._pumpDone) await Promise.race([this._pumpDone, sleep(drainTimeout)]);
      this._failPendingWrites();
      await this._abortWriter();

      if (this._reader) {
        try {
          await this._reader.cancel();
        } catch (e) {
          /* ignore */
        }
      }
      if (this._readLoopDone) await this._readLoopDone;
      await this._closePortQuietly();
      this._closing = false;
      this._setClosed();
    }

    /** Close and forget this port so the browser asks again next time. */
    async forget() {
      const port = this.port;
      await this.close();
      if (port && typeof port.forget === 'function') {
        try {
          await port.forget();
        } catch (e) {
          /* ignore */
        }
      }
    }

    isOpen() {
      return this.state === 'open';
    }

    /** USB info of the open port: { usbVendorId, usbProductId } (may be empty). */
    portInfo() {
      return this.port && this.port.getInfo ? this.port.getInfo() : {};
    }

    /** Toggle DTR/RTS; resets Uno and boards with a compatible reset circuit. */
    async reset(delayAfter = this.options.bootDelay) {
      if (!this.port || this.state !== 'open') return;
      await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await sleep(100);
      await this.port.setSignals({ dataTerminalReady: true, requestToSend: true });
      this.clear();
      this._writesAllowedAt = Date.now() + delayAfter;
    }

    // ------------------------------------------------------------ reading

    /** Number of unread bytes. */
    available() {
      return this._in.length;
    }

    /** Read one byte (0-255) like Arduino's Serial.read(). Returns -1 if nothing. */
    readByte() {
      if (this._in.length === 0) return -1;
      return this._in.take(1)[0];
    }

    /** Read bytes as a Uint8Array (all, or up to n). */
    readBytes(n) {
      return this._in.take(n === undefined ? this._in.length : n);
    }

    /** Read every unread byte as text. */
    readString() {
      return this._strDecoder.decode(this._in.take(this._in.length), { stream: true });
    }

    /** Alias of readString(), matches other serial libraries. */
    read() {
      return this.readString();
    }

    /**
     * Read text up to (not including) the delimiter. Returns null if the
     * delimiter has not arrived yet.
     */
    readUntil(delimiter = '\n') {
      const seq = this._encoder.encode(delimiter);
      const idx = this._in.indexOfSeq(seq);
      if (idx === -1) return null;
      const bytes = this._in.take(idx);
      this._in.drop(seq.length);
      return new TextDecoder(this.options.encoding).decode(bytes);
    }

    /** Read the next complete line (without \r\n), or null if none yet. */
    readLine() {
      const line = this.readUntil('\n');
      if (line === null) return null;
      return line.endsWith('\r') ? line.slice(0, -1) : line;
    }

    /** Read every complete line waiting in the buffer. */
    readLines() {
      const out = [];
      let line;
      while ((line = this.readLine()) !== null) out.push(line);
      return out;
    }

    /** Next line parsed into numbers: "12,34,56" -> [12, 34, 56]. null if none. */
    readNumbers(separator) {
      const line = this.readLine();
      return line === null ? null : parseNumbers(line, separator);
    }

    /**
     * The most recently received line. Does not consume the buffer, so it is
     * ideal in draw() when you only care about the newest sensor value.
     */
    lastLine() {
      return this._lastLine;
    }

    /** lastLine() parsed into numbers. Returns [] before the first line. */
    lastNumbers(separator) {
      return parseNumbers(this._lastLine, separator);
    }

    /** Total number of lines received since opening. */
    lineCount() {
      return this._lineCount;
    }

    /** Throw away unread data. */
    clear() {
      this._in.clear();
      this._lines.reset();
      this._strDecoder = new TextDecoder(this.options.encoding);
    }

    // ------------------------------------------------------------ writing

    /**
     * Send data. Returns a Promise<boolean> (you don't have to await it).
     *   write('hello')           text
     *   write(65)                one byte (0-255)
     *   write([1, 2, 3])         bytes
     *   write(new Uint8Array(…)) bytes
     */
    write(data) {
      return this._enqueue(this._toBytes(data));
    }

    print(data) {
      return this.write(data);
    }

    /**
     * Send text followed by "\n". Several values are joined with commas:
     *   println(mouseX, mouseY)  ->  "120,45\n"
     * Arduino side: Serial.readStringUntil('\n') or Serial.parseInt().
     */
    println(...values) {
      const text = values.map((v) => (typeof v === 'number' ? fmtNumber(v) : String(v))).join(',');
      return this.write(text + '\n');
    }

    /** True while data is still waiting to be sent. */
    isBusy() {
      return this._out.length > 0 || !!this._pumpDone;
    }

    // ------------------------------------------------------------ events

    /**
     * Events: 'connect', 'disconnect', 'line' (string), 'data' (Uint8Array), 'error'.
     *   serial.on('line', (line) => console.log(line));
     */
    on(event, callback) {
      (this._listeners[event] || (this._listeners[event] = [])).push(callback);
      return this;
    }

    off(event, callback) {
      const list = this._listeners[event];
      if (!list) return this;
      if (!callback) delete this._listeners[event];
      else this._listeners[event] = list.filter((f) => f !== callback);
      return this;
    }

    /** Remove listeners and close. Used when the sketch is removed. */
    async dispose() {
      await this.close();
      if (isSupported()) {
        navigator.serial.removeEventListener('connect', this._onUsbConnect);
        navigator.serial.removeEventListener('disconnect', this._onUsbDisconnect);
      }
      this._listeners = {};
      allSerials.delete(this);
    }

    // ------------------------------------------------------------ internals

    _resolveFilters() {
      const f = this.options.filters;
      if (!f) return null;
      if (f === 'arduino') return ARDUINO_FILTERS;
      return Array.isArray(f) ? f : [f];
    }

    _emit(event, arg) {
      const list = this._listeners[event];
      if (!list) return;
      for (const cb of list.slice()) {
        try {
          cb(arg);
        } catch (err) {
          console.error(`${TAG} '${event}' 콜백에서 오류:`, err);
        }
      }
    }

    async _openPort(port) {
      if (port.readable) {
        console.error(`${TAG} 이 포트는 이미 사용 중입니다. 다른 탭이나 Arduino IDE 시리얼 모니터를 닫아주세요.`);
        return false;
      }
      this.state = 'opening';
      const o = this.options;
      try {
        await port.open({
          baudRate: o.baudRate,
          dataBits: o.dataBits,
          stopBits: o.stopBits,
          parity: o.parity,
          flowControl: o.flowControl,
          bufferSize: o.bufferSize,
        });
      } catch (err) {
        this.state = 'closed';
        if (err && err.name === 'InvalidStateError') {
          console.error(`${TAG} 포트가 이미 열려 있습니다. 다른 탭/프로그램(Arduino IDE 시리얼 모니터 등)을 닫아주세요.`);
        } else if (err && err.name === 'NetworkError') {
          console.error(`${TAG} 포트를 열 수 없습니다. 다른 프로그램이 사용 중이거나 보드가 분리되었습니다.`);
        } else {
          console.error(`${TAG} 포트 열기 실패:`, err);
        }
        this._emit('error', err);
        return false;
      }

      this.port = port;
      this.state = 'open';
      this._lostPortInfo = null;
      this.clear();
      this._lastLine = null;
      this._lineCount = 0;
      this._writesAllowedAt = Date.now() + (o.bootDelay || 0);
      this._readLoopDone = this._readLoop();
      this._emit('connect', this.portInfo());
      return true;
    }

    // NOTE: the read and write loops below are written as callback chains
    // instead of for/while on purpose. The p5.js Web Editor adds "loop
    // protection" to every script and stops any for/while loop that runs
    // longer than 100 ms ("Infinite loop detected"), and a serial read loop
    // runs for as long as the port is open.
    _readLoop() {
      const port = this.port;
      return new Promise((resolveLoop) => {
        const finish = async () => {
          if (!this._closing && this.port === port) {
            // The stream ended without close(): the board was unplugged.
            this._lostPortInfo = port.getInfo ? port.getInfo() : {};
            this._failPendingWrites();
            await this._abortWriter();
            await this._closePortQuietly();
            this._setClosed();
            console.warn(
              `${TAG} 보드 연결이 끊어졌습니다.` +
                (this.options.autoReconnect ? ' 다시 꽂으면 자동으로 재연결합니다.' : '')
            );
          }
          resolveLoop();
        };

        const startReader = () => {
          if (!port.readable || this._closing) return finish();
          let reader;
          try {
            reader = port.readable.getReader();
          } catch (err) {
            return finish();
          }
          this._reader = reader;
          const release = () => {
            try {
              reader.releaseLock();
            } catch (e) {
              /* ignore */
            }
            this._reader = null;
          };

          const readNext = () => {
            reader.read().then(
              ({ value, done }) => {
                if (done) {
                  release();
                  return finish();
                }
                try {
                  if (value && value.length) this._onBytes(value);
                } catch (err) {
                  console.error(TAG, err);
                }
                readNext();
              },
              (err) => {
                if (!this._closing) {
                  if (err && RECOVERABLE_ERRORS.includes(err.name)) {
                    console.warn(`${TAG} 수신 오류(${err.name}) — 계속 읽습니다. 보드레이트가 맞는지 확인하세요.`);
                  }
                  this._emit('error', err);
                }
                release();
                startReader(); // recoverable errors get a fresh stream; fatal ones end here
              }
            );
          };
          readNext();
        };

        startReader();
      });
    }

    _onBytes(bytes) {
      this._in.push(bytes);
      const over = this._in.length - this.options.maxBuffer;
      if (over > 0) this._in.drop(over);

      this._emit('data', bytes);

      const lines = this._lines.push(bytes);
      for (const line of lines) {
        this._lastLine = line;
        this._lineCount++;
        this._emit('line', line);
      }
    }

    async _closePortQuietly() {
      const port = this.port;
      if (!port) return;
      try {
        await port.close();
      } catch (e) {
        /* already closed / lost */
      }
    }

    _setClosed() {
      const wasOpen = this.state !== 'closed';
      this.state = 'closed';
      this._reader = null;
      this._readLoopDone = null;
      if (wasOpen) this._emit('disconnect');
    }

    _handleUsbDisconnect(e) {
      // Reader loop handles cleanup; this just makes it faster on some OSes.
      if (this.port && e.target === this.port && this.state === 'open') {
        if (this._reader) this._reader.cancel().catch(() => {});
      }
    }

    async _handleUsbConnect(e) {
      if (!this.options.autoReconnect || !this._lostPortInfo || this.state !== 'closed') return;
      const port = e.target;
      const info = port.getInfo ? port.getInfo() : {};
      const lost = this._lostPortInfo;
      const same =
        port === this.port ||
        (lost.usbVendorId !== undefined &&
          info.usbVendorId === lost.usbVendorId &&
          info.usbProductId === lost.usbProductId);
      if (!same) return;
      await sleep(300); // let the OS finish setting up the device
      if (this.state === 'closed' && this._lostPortInfo) await this._openPort(port);
    }

    _toBytes(data) {
      if (data == null) return new Uint8Array(0);
      if (typeof data === 'string') return this._encoder.encode(data);
      if (typeof data === 'number') {
        if (!Number.isInteger(data) || data < 0 || data > 255) {
          console.warn(`${TAG} write(${data}): 숫자는 0~255 사이 정수 1바이트로 전송됩니다. 텍스트로 보내려면 println(${data})을 사용하세요.`);
        }
        return Uint8Array.of(data & 0xff);
      }
      if (typeof data === 'boolean') return Uint8Array.of(data ? 1 : 0);
      if (data instanceof Uint8Array) return data;
      if (data instanceof ArrayBuffer) return new Uint8Array(data);
      if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (Array.isArray(data)) return Uint8Array.from(data, (v) => v & 0xff);
      return this._encoder.encode(String(data));
    }

    _enqueue(bytes) {
      if (this.state !== 'open') {
        if (!this._warnedClosed) {
          console.warn(`${TAG} 포트가 열려있지 않아 전송하지 못했습니다. (이 경고는 한 번만 표시됩니다)`);
          this._warnedClosed = true;
        }
        return Promise.resolve(false);
      }
      this._warnedClosed = false;
      if (bytes.length === 0) return Promise.resolve(true);
      if (this._outBytes + bytes.length > this.options.maxWriteQueue) {
        if (!this._warnedFull) {
          console.warn(
            `${TAG} 전송 대기열이 가득 차 데이터를 버렸습니다. draw()마다 보내고 있다면 값이 바뀔 때만 보내거나 보드레이트를 높이세요.`
          );
          this._warnedFull = true;
        }
        return Promise.resolve(false);
      }
      this._warnedFull = false;
      return new Promise((resolve) => {
        this._out.push({ bytes, resolve });
        this._outBytes += bytes.length;
        if (!this._pumpDone) this._startPump();
      });
    }

    _startPump() {
      this._pumpDone = this._pump().finally(() => {
        this._pumpDone = null;
        // A write's promise can resolve before this finalizer runs.
        // Restart for writes queued by an awaiting caller in that interval.
        if (this._out.length && (this.state === 'open' || this.state === 'closing')) {
          return this._startPump();
        }
      });
      return this._pumpDone;
    }

    async _pump() {
      const wait = this._writesAllowedAt - Date.now();
      if (wait > 0) await sleep(wait); // Arduino is still rebooting
      const port = this.port;
      if (!port || !port.writable || (this.state !== 'open' && this.state !== 'closing')) {
        this._failPendingWrites();
        return;
      }
      let writer;
      try {
        writer = port.writable.getWriter();
        this._writer = writer;
      } catch (err) {
        this._emit('error', err);
        this._failPendingWrites();
        return;
      }
      try {
        await new Promise((done) => {
          const writeNext = () => {
            if (!this._out.length) return done();
            const item = this._out.shift();
            this._outBytes -= item.bytes.length;
            writer.write(item.bytes).then(
              () => {
                item.resolve(true);
                writeNext();
              },
              (err) => {
                item.resolve(false);
                this._emit('error', err);
                this._failPendingWrites();
                done();
              }
            );
          };
          writeNext();
        });
      } finally {
        this._writer = null;
        try {
          writer.releaseLock();
        } catch (e) {
          /* ignore */
        }
      }
    }

    async _abortWriter() {
      const w = this._writer;
      if (!w) return;
      try {
        await w.abort();
      } catch (e) {
        /* ignore */
      }
      if (this._pumpDone) await Promise.race([this._pumpDone, sleep(200)]);
    }

    _failPendingWrites() {
      const items = this._out;
      this._out = [];
      this._outBytes = 0;
      for (const item of items) item.resolve(false);
    }
  }

  function fmtNumber(n) {
    // Avoid "0.30000000000000004" style output; Arduino parses plain decimals.
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);
  }

  function matchesFilters(port, filters) {
    if (!filters) return true;
    const info = port.getInfo ? port.getInfo() : {};
    return filters.some(
      (f) =>
        (f.usbVendorId === undefined || f.usbVendorId === info.usbVendorId) &&
        (f.usbProductId === undefined || f.usbProductId === info.usbProductId)
    );
  }

  // ---------------------------------------------------------------------------
  // p5 integration
  // ---------------------------------------------------------------------------

  /** Add a connect/disconnect button. Works with or without p5's DOM functions. */
  function createSerialButton(p, serial, opts = {}) {
    if (typeof opts === 'string') opts = { label: opts };
    const labels = {
      connect: opts.label || '아두이노 연결',
      disconnect: opts.disconnectLabel || '연결 끊기',
    };
    const openArgs = opts.baudRate ? { baudRate: opts.baudRate } : undefined;

    let el, dom;
    if (p && typeof p.createButton === 'function') {
      el = p.createButton(labels.connect);
      dom = el.elt;
    } else {
      dom = document.createElement('button');
      dom.textContent = labels.connect;
      document.body.appendChild(dom);
      el = dom;
    }
    const refresh = () => {
      dom.textContent = serial.isOpen() ? labels.disconnect : labels.connect;
    };
    dom.addEventListener('click', () => {
      if (serial.isOpen()) serial.close();
      else serial.open(openArgs);
    });
    serial.on('connect', refresh).on('disconnect', refresh);
    if (!isSupported()) {
      dom.disabled = true;
      dom.textContent = 'Web Serial 미지원 브라우저';
    }
    refresh();
    return el;
  }

  function addon(p5, fn, lifecycles) {
    p5.Serial = Serial;
    p5.Serial.VERSION = VERSION;
    p5.Serial.ARDUINO_FILTERS = ARDUINO_FILTERS;

    /** const serial = createSerial();  or  createSerial({ baudRate: 115200 }) */
    fn.createSerial = function (options) {
      if (typeof options === 'number') options = { baudRate: options };
      const s = new Serial(options);
      (this._serials || (this._serials = [])).push(s);
      return s;
    };

    fn.createSerialButton = function (serial, opts) {
      return createSerialButton(this, serial, opts);
    };

    fn.serialSupported = function () {
      return isSupported();
    };

    const cleanup = function () {
      const list = this._serials || [];
      this._serials = [];
      return Promise.all(list.map((s) => s.dispose()));
    };

    if (lifecycles) {
      lifecycles.remove = cleanup; // p5 2.x
    } else if (typeof fn.registerMethod === 'function') {
      fn.registerMethod('remove', cleanup); // p5 1.x
    }
  }

  // Release ports when the page goes away (lets another tab open them quickly).
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      for (const s of allSerials) s.close();
    });
  }

  const p5ref = root.p5;
  if (p5ref && typeof p5ref.registerAddon === 'function') {
    p5ref.registerAddon(addon); // p5.js 2.x
  } else if (p5ref && p5ref.prototype) {
    addon(p5ref, p5ref.prototype, null); // p5.js 1.x
  } else {
    console.warn(`${TAG} p5.js를 찾을 수 없습니다. p5.js 다음에 p5.serial2.js를 로드하세요. (Serial 클래스는 window.P5Serial2로 사용 가능)`);
  }

  const api = { Serial, ByteQueue, LineSplitter, ARDUINO_FILTERS, addon, createSerialButton, isSupported, VERSION };
  root.P5Serial2 = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
