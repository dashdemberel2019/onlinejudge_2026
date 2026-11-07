// Хөрвүүлэгч worker: clang + lld-г нэг удаа ачаалж, C++ кодыг .wasm болгоно.
self.importScripts('shared.js');

const BIN = 'bin/';
let log = '';
let api = null;
let ready = null;

// clang-ийн мессеж latin1 байдлаар ирдэг тул UTF-8 болгон буцааж задална.
const fixUtf8 = s => { try { return new TextDecoder().decode(Uint8Array.from(s, c => c.charCodeAt(0) & 255)); } catch (_) { return s; } };
const stripAnsi = s => fixUtf8(s).replace(/\x1b\[[0-9;]*m/g, '');

function init() {
  if (ready) return ready;
  api = new API({
    async readBuffer(name) {
      const r = await fetch(name);
      if (!r.ok) throw new Error(`${name}: ${r.status}`);
      return r.arrayBuffer();
    },
    async compileStreaming(name) {
      if (WebAssembly.compileStreaming) {
        try { return await WebAssembly.compileStreaming(fetch(name)); } catch (e) { /* MIME буруу бол доош */ }
      }
      const r = await fetch(name);
      return WebAssembly.compile(await r.arrayBuffer());
    },
    hostWrite(s) { log += s; },
    clang: BIN + 'clang.wasm',
    lld: BIN + 'lld.wasm',
    memfs: BIN + 'memfs.wasm',
    sysroot: BIN + 'sysroot.tar',
  });
  // Явцын мэдээллийг логт бичихгүй.
  api.hostLog = () => {};
  api.hostLogAsync = async (_m, p) => p;
  ready = (async () => {
    await api.ready;
    // clang, lld модулиудыг урьдчилан хөрвүүлж кэшлэнэ.
    await api.getModule(api.clangFilename);
    self.postMessage({ type: 'progress', stage: 'clang' });
    await api.getModule(api.lldFilename);
  })();
  return ready;
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      await init();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'initError', error: String(err && err.message || err) });
    }
    return;
  }
  if (msg.type === 'compile') {
    const t0 = performance.now();
    log = '';
    try {
      await init();
      await api.compile({ input: 'main.cpp', contents: new TextEncoder().encode(msg.code), obj: 'main.o', opt: msg.opt || '2' });
      await api.link('main.o', 'main.wasm', { maxMemory: msg.maxMemory, stackSize: msg.stackSize,
                                               pre: ['-lc-printscan-long-double'],
                                               post: ['lib/wasm32-wasi/beltgel_rt.o', '-lc++', '-lc++abi', '-lc',
                                                      'lib/clang/8.0.1/lib/wasi/libclang_rt.builtins-wasm32.a'] });
      const bytes = api.memfs.getFileContents('main.wasm').slice();
      self.postMessage({ type: 'compiled', id: msg.id, ok: true, wasm: bytes, log: stripAnsi(log).trim(),
                         ms: performance.now() - t0 }, [bytes.buffer]);
    } catch (err) {
      let out = stripAnsi(log)
        .replace(/^Error: process exited with code \d+\.?\s*$/m, '')
        .trim();
      if (!out) out = String(err && err.message || err);
      self.postMessage({ type: 'compiled', id: msg.id, ok: false, log: out, ms: performance.now() - t0 });
    }
  }
};
