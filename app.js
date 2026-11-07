import { Judge } from './judge/judge.js';

const judge = new Judge('judge/');
const app = document.getElementById('app');
const statusEl = document.getElementById('judgeStatus');
let problems = null;

// Линкерт өгсөн stack-ийн хэмжээ (judge/shared.js: 64MB). Санах ойн баганад үүнийг хасч харуулна.
const STACK_BYTES = 64 * 1024 * 1024;

const TEMPLATE = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`;

// ---------- туслах ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d = null) { try { const v = localStorage.getItem('bg:' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('bg:' + k, JSON.stringify(v)); } catch (_) {} },
};
const textCache = new Map();
async function fetchText(url) {
  if (textCache.has(url)) return textCache.get(url);
  const p = fetch(url).then(r => { if (!r.ok) throw new Error(url + ': ' + r.status); return r.text(); });
  textCache.set(url, p);
  return p;
}
const clip = (s, n = 2000) => s.length > n ? s.slice(0, n) + `\n… (${s.length - n} тэмдэгт таслав)` : s;
const VERDICT_MN = { AC: 'Зөв', WA: 'Буруу хариу', TLE: 'Хугацаа хэтэрсэн', RE: 'Ажиллах үеийн алдаа',
                     MLE: 'Санах ой хэтэрсэн', OLE: 'Гаралт хэт их', CE: 'Хөрвүүлэлтийн алдаа' };

function setStatus(text, cls) { statusEl.textContent = 'Шалгагч: ' + text; statusEl.className = 'judge-status ' + (cls || ''); }

let judgeInit = null;
function ensureJudge() {
  if (!judgeInit) {
    setStatus('clang ачаалж байна (~50MB, эхний удаа)…', 'loading');
    judgeInit = judge.init(stage => { if (stage === 'clang') setStatus('lld ачаалж байна…', 'loading'); })
      .then(() => setStatus('бэлэн', 'ready'))
      .catch(e => { judgeInit = null; setStatus('алдаа: ' + e.message, ''); throw e; });
  }
  return judgeInit;
}

async function loadProblems() {
  if (!problems) problems = await (await fetch('problems/index.json', { cache: 'no-cache' })).json();
  return problems;
}

// Оноо: дэд бодлоготой бол дэд бодлогын бүх тест зөв үед оноо авна, үгүй бол зөв тестийн хувь.
function computeScore(p, verdicts) {
  if (p.subtasks && p.subtasks.length) {
    let s = 0;
    const per = p.subtasks.map(st => {
      const ok = st.tests.every(t => verdicts[t] === 'AC');
      if (ok) s += st.score;
      return ok;
    });
    return { score: s, per };
  }
  const n = p.tests.length;
  const ac = p.tests.filter(t => verdicts[t.name] === 'AC').length;
  return { score: n ? Math.round(100 * ac / n * 100) / 100 : 0, per: [] };
}

// ---------- жагсаалт ----------
async function renderList() {
  document.title = 'Олимпиадын бэлтгэл';
  const ps = await loadProblems();
  const levels = [...new Set(ps.map(p => p.level).filter(Boolean))];
  app.innerHTML = `
    <div class="toolbar">
      <input id="q" placeholder="Бодлого, сэдвээр хайх…">
      <select id="lvl"><option value="">Бүх түвшин</option>${levels.map(l => `<option>${esc(l)}</option>`).join('')}</select>
    </div>
    <table class="list"><thead><tr><th>#</th><th>Бодлого</th><th>Түвшин</th><th>Сэдэв</th><th>Оноо</th></tr></thead><tbody id="rows"></tbody></table>`;
  const rows = document.getElementById('rows');
  const draw = () => {
    const q = document.getElementById('q').value.trim().toLowerCase();
    const lvl = document.getElementById('lvl').value;
    rows.innerHTML = ps.map((p, i) => ({ p, i })).filter(({ p }) =>
      (!lvl || p.level === lvl) &&
      (!q || (p.title + ' ' + p.id + ' ' + p.tags.join(' ')).toLowerCase().includes(q))
    ).map(({ p, i }) => {
      const best = store.get('best:' + p.id);
      const sc = best === null ? '' : `<span class="score ${best >= 100 ? 'full' : 'part'}">${best}</span>`;
      return `<tr><td>${i + 1}</td><td><a href="#/p/${encodeURIComponent(p.id)}">${esc(p.title)}</a></td>
        <td>${esc(p.level || '')}</td><td>${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</td><td>${sc}</td></tr>`;
    }).join('') || `<tr><td colspan="5" class="muted">Олдсонгүй</td></tr>`;
  };
  document.getElementById('q').oninput = draw;
  document.getElementById('lvl').onchange = draw;
  draw();
}

// ---------- бодлого ----------
async function renderProblem(id) {
  const ps = await loadProblems();
  const p = ps.find(x => x.id === id);
  if (!p) { app.innerHTML = `<p>Бодлого олдсонгүй. <a href="#/">Буцах</a></p>`; return; }
  document.title = p.title + ' — Олимпиадын бэлтгэл';
  const base = `problems/${encodeURIComponent(p.id)}/`;
  const testByName = Object.fromEntries(p.tests.map(t => [t.name, t]));

  app.innerHTML = `
  <div class="problem">
    <div class="card statement">
      <h1>${esc(p.title)}</h1>
      <div class="limits">Хугацаа: ${p.tl} сек · Санах ой: ${p.ml} MB · Тест: ${p.tests.length}${p.subtasks.length ? ' · Дэд бодлого: ' + p.subtasks.length : ''}</div>
      <div id="stmt" class="muted">Ачаалж байна…</div>
      <div id="samples"></div>
    </div>
    <div class="side">
      <div class="card">
        <textarea id="code" class="code" spellcheck="false"></textarea>
        <div class="actions">
          <button class="primary" id="submit">Шалгах</button>
          <button id="runBtn">Ажиллуулах</button>
          <button id="reset" title="Анхны загвар руу буцаах">Шинэчлэх</button>
          <span class="muted" id="msg"></span>
        </div>
        <details class="custom" id="customBox"><summary>Өөрийн оролтоор ажиллуулах</summary>
          <textarea id="cin" placeholder="stdin"></textarea>
          <pre class="io" id="cout"></pre>
        </details>
      </div>
      <div class="card" id="result" hidden></div>
    </div>
  </div>`;

  // Өгүүлбэр
  fetchText(base + 'statement.md').then(md => {
    const el = document.getElementById('stmt');
    if (!el) return;
    // $...$ доторх \ ба _-г marked эвдэхгүйн тулд эхлээд нууж байна
    const math = [];
    const safe = md.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, m => { math.push(m); return `@@M${math.length - 1}@@`; });
    el.className = '';
    el.innerHTML = (window.marked ? marked.parse(safe) : `<pre>${esc(safe)}</pre>`)
      .replace(/@@M(\d+)@@/g, (_, i) => esc(math[+i]));
    if (window.renderMathInElement) renderMathInElement(el, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false });
  }).catch(() => { const el = document.getElementById('stmt'); if (el) el.textContent = 'statement.md олдсонгүй'; });

  // Жишээнүүд
  Promise.all(p.samples.filter(n => testByName[n]).map(async n => {
    const t = testByName[n];
    return [await fetchText(base + t.in), await fetchText(base + t.out)];
  })).then(list => {
    const el = document.getElementById('samples');
    if (!el || !list.length) return;
    el.innerHTML = '<h2>Жишээ</h2>' + list.map(([i, o], k) => `
      <div class="samples">
        <div><div class="label">Оролт ${k + 1} <span class="copy" data-k="${k}">хуулах</span></div><pre>${esc(i)}</pre></div>
        <div><div class="label">Гаралт ${k + 1}</div><pre>${esc(o)}</pre></div>
      </div>`).join('');
    el.querySelectorAll('.copy').forEach(b => b.onclick = () => {
      navigator.clipboard.writeText(list[+b.dataset.k][0]);
      b.textContent = 'хуулсан'; setTimeout(() => b.textContent = 'хуулах', 1200);
    });
    const cin = document.getElementById('cin');
    if (cin && !cin.value) cin.value = list[0][0];
  });

  // Засварлагч
  const ta = document.getElementById('code');
  ta.value = store.get('code:' + p.id, TEMPLATE);
  let editor = null;
  if (window.CodeMirror) {
    editor = CodeMirror.fromTextArea(ta, { mode: 'text/x-c++src', lineNumbers: true, indentUnit: 4, tabSize: 4,
      matchBrackets: true, autoCloseBrackets: true, extraKeys: { 'Ctrl-Enter': () => submit(), 'Cmd-Enter': () => submit() } });
    editor.on('change', () => store.set('code:' + p.id, editor.getValue()));
  } else {
    ta.oninput = () => store.set('code:' + p.id, ta.value);
  }
  const getCode = () => editor ? editor.getValue() : ta.value;
  document.getElementById('reset').onclick = () => {
    if (!confirm('Кодыг анхны загвар руу буцаах уу?')) return;
    editor ? editor.setValue(TEMPLATE) : (ta.value = TEMPLATE);
  };

  ensureJudge().catch(() => {});   // хуудсанд ороход clang-ийг урьдчилан ачаалж эхэлнэ

  const msg = document.getElementById('msg');
  const btnSubmit = document.getElementById('submit');
  const btnRun = document.getElementById('runBtn');
  const busy = (b) => { btnSubmit.disabled = btnRun.disabled = b; };

  async function compileOrShow() {
    msg.textContent = 'Шалгагч ачаалж байна…';
    await ensureJudge();
    msg.textContent = 'Хөрвүүлж байна…';
    const c = await judge.compile(getCode(), { maxMemory: p.ml * 1024 * 1024 });
    return c;
  }

  btnRun.onclick = async () => {
    busy(true);
    const out = document.getElementById('cout');
    document.getElementById('customBox').open = true;
    try {
      const c = await compileOrShow();
      if (!c.ok) { out.textContent = c.log; msg.textContent = 'Хөрвүүлэлтийн алдаа'; return; }
      msg.textContent = 'Ажиллаж байна…';
      const r = await judge.runCustom(c.wasm, document.getElementById('cin').value, Math.max(5000, p.tl * 1000 * 3));
      out.textContent = clip(r.stdout, 20000) + (r.stderr ? '\n--- stderr ---\n' + clip(r.stderr) : '') +
        (r.status !== 'ok' ? `\n--- ${r.status.toUpperCase()} ${r.message || ''}` : '');
      msg.textContent = `${r.ms.toFixed(0)} мс`;
    } catch (e) { msg.textContent = 'Алдаа: ' + e.message; }
    finally { busy(false); }
  };

  async function submit() {
    if (btnSubmit.disabled) return;
    busy(true);
    const res = document.getElementById('result');
    res.hidden = false;
    try {
      const c = await compileOrShow();
      if (!c.ok) {
        res.innerHTML = `<div class="summary"><span class="verdict v-CE">CE</span> ${VERDICT_MN.CE}</div><pre class="celog">${esc(c.log)}</pre>`;
        msg.textContent = '';
        return;
      }
      const verdicts = {};
      const rowsHtml = () => {
        const line = t => {
          const r = verdicts[t.name];
          const v = r ? r.verdict : 'WAIT';
          return `<tr class="${r && r.verdict !== 'AC' ? 'clickable' : ''}" data-t="${esc(t.name)}">
            <td>${esc(t.name)}</td><td><span class="verdict v-${v}">${v === 'WAIT' ? '…' : v}</span></td>
            <td>${r ? r.ms.toFixed(0) + ' мс' : ''}</td><td>${r && r.memBytes ? Math.max(1, Math.round((r.memBytes - STACK_BYTES) / 1048576)) + ' MB' : ''}</td></tr>`;
        };
        if (p.subtasks.length) {
          return p.subtasks.map((st, k) => `<tr class="st"><td colspan="4">Дэд бодлого ${k + 1}${st.name ? ' — ' + esc(st.name) : ''} (${st.score} оноо)</td></tr>` +
            st.tests.filter(n => testByName[n]).map(n => line(testByName[n])).join('')).join('');
        }
        return p.tests.map(line).join('');
      };
      const draw = (done) => {
        const vmap = Object.fromEntries(Object.entries(verdicts).map(([k, v]) => [k, v.verdict]));
        const { score } = computeScore(p, vmap);
        const first = p.tests.map(t => verdicts[t.name]).find(r => r && r.verdict !== 'AC');
        const head = done
          ? `<div class="summary">${score >= 100 ? '<span class="verdict v-AC">AC</span>' : `<span class="verdict v-${first ? first.verdict : 'WA'}">${first ? first.verdict : 'WA'}</span>`} Оноо: ${score} / 100</div>`
          : `<div class="summary">Шалгаж байна… ${Object.keys(verdicts).length} / ${p.tests.length}</div>`;
        res.innerHTML = head + `<table class="res"><thead><tr><th>Тест</th><th>Үр дүн</th><th>Хугацаа</th><th>Санах ой</th></tr></thead><tbody>${rowsHtml()}</tbody></table>
          <div id="detail"></div>`;
        res.querySelectorAll('tr.clickable').forEach(tr => tr.onclick = () => showDetail(verdicts[tr.dataset.t]));
        return score;
      };
      draw(false);
      msg.textContent = 'Шалгаж байна…';
      const tests = p.tests.map(t => ({ name: t.name, input: () => fetchText(base + t.in), output: () => fetchText(base + t.out) }));
      await judge.runTests(c.wasm, tests, { tlMs: p.tl * 1000, mlBytes: p.ml * 1024 * 1024, checker: p.checker },
        (_i, r) => { verdicts[r.name] = r; draw(false); });
      const score = draw(true);
      const best = store.get('best:' + p.id);
      if (best === null || score > best) store.set('best:' + p.id, score);
      msg.textContent = '';
      const firstBad = p.tests.map(t => verdicts[t.name]).find(r => r && r.verdict !== 'AC');
      if (firstBad) showDetail(firstBad);
    } catch (e) {
      res.innerHTML = `<pre class="celog">${esc(e.stack || e.message)}</pre>`;
    } finally { busy(false); }
  }
  btnSubmit.onclick = submit;
}

function showDetail(r) {
  const el = document.getElementById('detail');
  if (!el || !r) return;
  el.innerHTML = `<div class="detail"><b>Тест ${esc(r.name)}:</b> <span class="verdict v-${r.verdict}">${r.verdict}</span> ${esc(VERDICT_MN[r.verdict] || '')}
    ${r.message ? `<span class="muted"> (${esc(r.message)})</span>` : ''}
    <div class="grid">
      <div><div class="muted">Оролт</div><pre class="io">${esc(clip(r.input))}</pre></div>
      <div><div class="muted">Хүлээгдэж буй</div><pre class="io">${esc(clip(r.expected))}</pre></div>
      <div><div class="muted">Таны гаралт</div><pre class="io">${esc(clip(r.stdout || ''))}</pre></div>
    </div>
    ${r.stderr ? `<div class="muted">stderr</div><pre class="io">${esc(clip(r.stderr))}</pre>` : ''}</div>`;
}

// ---------- чиглүүлэгч ----------
async function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  try {
    const m = h.match(/^\/p\/(.+)$/);
    if (m) await renderProblem(decodeURIComponent(m[1]));
    else await renderList();
  } catch (e) {
    app.innerHTML = `<pre class="celog">${esc(e.stack || e.message)}</pre>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
// defer скриптүүд (marked, CodeMirror) ачаалагдсаны дараа эхэлнэ
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', route); else route();
