// Үндсэн thread дээрх шалгагч: хөрвүүлэх, тест бүрээр ажиллуулах, TLE-ийг хянах, гаралт харьцуулах.
// Хэрэглээ:
//   const j = new Judge('judge/');
//   await j.init(p => ...);                         // clang ачаалах
//   const c = await j.compile(code);                // {ok, log, wasm}
//   const r = await j.runTests(c.wasm, tests, {tl}, onEach);

export class Judge {
  constructor(base = 'judge/') {
    this.base = base;
    this.compiler = null;
    this.readyPromise = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  init(onProgress = () => {}) {
    if (this.readyPromise) return this.readyPromise;
    this.compiler = new Worker(this.base + 'compiler-worker.js');
    this.readyPromise = new Promise((resolve, reject) => {
      this.compiler.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') onProgress(m.stage);
        else if (m.type === 'ready') resolve();
        else if (m.type === 'initError') { this.readyPromise = null; reject(new Error(m.error)); }
        else if (m.type === 'compiled') {
          const cb = this.pending.get(m.id);
          if (cb) { this.pending.delete(m.id); cb(m); }
        }
      };
      this.compiler.onerror = (e) => reject(new Error(e.message || 'compiler worker error'));
    });
    this.compiler.postMessage({ type: 'init' });
    return this.readyPromise;
  }

  async compile(code, opts = {}) {
    await this.init();
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.compiler.postMessage({ type: 'compile', id, code, opt: opts.opt || '2',
                                  maxMemory: opts.maxMemory, stackSize: opts.stackSize });
    });
  }

  _spawnRunner(wasm) {
    const w = new Worker(this.base + 'runner-worker.js');
    const loaded = new Promise((resolve, reject) => {
      w.onmessage = (e) => { if (e.data.type === 'loaded') resolve(); };
      w.onerror = (e) => reject(new Error(e.message || 'runner error'));
    });
    w.postMessage({ type: 'load', wasm: wasm.slice() });
    return { w, loaded };
  }

  // Нэг оролтоор ажиллуулна. tlMs: хугацааны хязгаар (мс).
  // Хариу: {status: ok|re|tle|ole, ms, stdout(string), stderr, message}
  async _runOne(runnerRef, wasm, input, tlMs) {
    if (!runnerRef.r) runnerRef.r = this._spawnRunner(wasm);
    await runnerRef.r.loaded;
    const { w } = runnerRef.r;
    const id = this.nextId++;
    return new Promise((resolve) => {
      let timer = null;
      const finish = (res) => { clearTimeout(timer); resolve(res); };
      w.onmessage = (e) => {
        const m = e.data;
        if (m.id !== id) return;
        if (m.type === 'started') {
          // Хатуу хязгаар: TL + 0.5с-ээс хэтэрвэл worker-ийг устгана.
          timer = setTimeout(() => {
            w.terminate();
            runnerRef.r = null;
            finish({ status: 'tle', ms: tlMs, stdout: '', stderr: '', message: '' });
          }, tlMs + 500);
        } else if (m.type === 'result') {
          let status = m.status;
          if (status === 'ok' && m.ms > tlMs) status = 'tle';
          finish({ status, ms: m.ms, memBytes: m.memBytes, stdout: new TextDecoder().decode(m.stdout),
                   stderr: m.stderr, message: m.message, exitCode: m.exitCode });
        }
      };
      w.onerror = (e) => {
        e.preventDefault();
        w.terminate();
        runnerRef.r = null;
        finish({ status: 're', ms: 0, stdout: '', stderr: '', message: e.message || 'worker crashed' });
      };
      w.postMessage({ type: 'run', id, input });
    });
  }

  // Ганц оролтоор ажиллуулах ("Ажиллуулах" товч)
  async runCustom(wasm, input, tlMs = 5000) {
    const ref = {};
    const res = await this._runOne(ref, wasm, input, tlMs);
    if (ref.r) ref.r.w.terminate();
    return res;
  }

  // tests: [{name, input, output}], тестийн өгөгдлийг string-ээр эсвэл async функцээр өгч болно.
  async runTests(wasm, tests, { tlMs = 1000, mlBytes = 0, checker = 'tokens', stopOnFail = false } = {}, onEach = () => {}) {
    const ref = {};
    const results = [];
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      const input = typeof t.input === 'function' ? await t.input() : t.input;
      const expected = typeof t.output === 'function' ? await t.output() : t.output;
      const r = await this._runOne(ref, wasm, input, tlMs);
      let verdict;
      if (r.status === 'tle') verdict = 'TLE';
      else if (r.status === 're') verdict = (mlBytes && r.memBytes >= mlBytes * 0.95) ? 'MLE' : 'RE';
      else if (r.status === 'ole') verdict = 'OLE';
      else verdict = compareOutput(r.stdout, expected, checker) ? 'AC' : 'WA';
      const res = { name: t.name, verdict, ms: r.ms, memBytes: r.memBytes, message: r.message,
                    stdout: r.stdout, stderr: r.stderr, input, expected };
      results.push(res);
      onEach(i, res);
      if (stopOnFail && verdict !== 'AC') break;
    }
    if (ref.r) ref.r.w.terminate();
    return results;
  }
}

// Гаралт харьцуулах.
//  tokens: хоосон зай/мөрийн төгсгөлийг үл тооно (CMS white-diff-тэй төстэй)
//  lines : мөр бүрийн төгсгөлийн хоосон зай, файлын төгсгөлийн хоосон мөрийг үл тооно
//  float:1e-6 : тоон утгыг харьцангуй/абсолют алдаагаар харьцуулна
export function compareOutput(got, exp, checker = 'tokens') {
  if (checker === 'lines') {
    const norm = s => s.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
    return norm(got) === norm(exp);
  }
  const a = got.split(/\s+/).filter(Boolean);
  const b = exp.split(/\s+/).filter(Boolean);
  if (a.length !== b.length) return false;
  if (checker.startsWith('float')) {
    const eps = parseFloat(checker.split(':')[1] || '1e-6');
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      const x = Number(a[i]), y = Number(b[i]);
      if (!isFinite(x) || !isFinite(y)) return false;
      if (Math.abs(x - y) > eps * Math.max(1, Math.abs(y))) return false;
    }
    return true;
  }
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
