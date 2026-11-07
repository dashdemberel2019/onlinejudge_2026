// Ажиллуулагч worker: хөрвүүлсэн .wasm-ыг тест бүрээр ажиллуулна.
// Хугацаа хэтэрвэл үндсэн thread энэ worker-ийг terminate хийнэ.
self.importScripts('shared.js');

const BIN = 'bin/';
let memfs = null;
let module = null;
let out = [], outLen = 0, err = [], errLen = 0;
const OUT_LIMIT = 64 * 1024 * 1024;   // 64MB-аас их гаралтыг OLE гэж үзнэ
let outOverflow = false;

function concat(chunks, len) {
  const r = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { r.set(c, o); o += c.length; }
  return r;
}

async function initMemfs() {
  if (memfs) return;
  memfs = new API.MemFS({
    async compileStreaming(name) {
      const r = await fetch(name);
      return WebAssembly.compile(await r.arrayBuffer());
    },
    hostWrite() {},
    hostWriteFd(fd, bytes) {
      if (fd === 1) {
        if (outLen + bytes.length > OUT_LIMIT) { outOverflow = true; return; }
        out.push(bytes); outLen += bytes.length;
      } else if (errLen < 65536) {
        err.push(bytes); errLen += bytes.length;
      }
    },
    memfsFilename: BIN + 'memfs.wasm',
  });
  await memfs.ready;
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'load') {
    await initMemfs();
    module = await WebAssembly.compile(msg.wasm);
    self.postMessage({ type: 'loaded' });
    return;
  }
  if (msg.type === 'run') {
    out = []; outLen = 0; err = []; errLen = 0; outOverflow = false;
    memfs.setStdinBytes(msg.input instanceof Uint8Array ? msg.input : new TextEncoder().encode(msg.input));
    let status = 'ok', exitCode = 0, message = '';
    let app;
    try {
      app = new API.App(module, memfs, 'main');
      await app.ready;               // санах ой бэлдэх хугацааг тооцохгүй
    } catch (ex) {
      self.postMessage({ type: 'result', id: msg.id, status: 're', exitCode: -1, ms: 0, memBytes: 0,
                         message: 'instantiate: ' + String(ex && ex.message || ex),
                         stdout: new Uint8Array(0), stderr: '' });
      return;
    }
    self.postMessage({ type: 'started', id: msg.id });
    const t0 = performance.now();
    try {
      app.exports._start();
    } catch (ex) {
      if (ex instanceof API.ProcExit) {
        exitCode = ex.code;
        if (ex.code !== 0) { status = 're'; message = `exit code ${ex.code}`; }
      } else {
        status = 're';
        message = String(ex && ex.message || ex);
      }
    }
    const ms = performance.now() - t0;
    if (outOverflow) { status = 'ole'; }
    let memBytes = 0;
    try { memBytes = app.exports.memory.buffer.byteLength; } catch (_) {}
    const stdout = concat(out, outLen);
    self.postMessage({
      type: 'result', id: msg.id, status, exitCode, message, ms, memBytes,
      stdout, stderr: new TextDecoder().decode(concat(err, errLen)),
    }, [stdout.buffer]);
  }
};
