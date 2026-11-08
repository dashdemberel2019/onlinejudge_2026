# Мэдээлэл зүйн бодлого шалгахад зориулсан сайт

Сервергүй, статик сайт. Бодлого, тестүүд нь энгийн файлууд. Оролцогчийн кодыг **хөтөч дотор**
clang (WebAssembly) хөрвүүлж, тест бүрээр ажиллуулна. Netlify, GitHub Pages эсвэл ямар ч
статик хостинг дээр байршуулж болно.

## Бүтэц

```
index.html, app.js, style.css    — сайт (жагсаалт, бодлогын хуудас, үр дүн)
judge/
  judge.js                       — үндсэн thread дээрх шалгагч (TLE хяналт, харьцуулалт)
  compiler-worker.js             — clang + lld ажиллуулдаг Web Worker
  runner-worker.js               — хөрвүүлсэн программыг тест бүрээр ажиллуулдаг Worker
  shared.js                      — binji/wasm-clang-ийн WASI runtime (засвартай)
  beltgel_rt.cpp                 — cin/cout хурдасгагч (эх код; хөрвүүлсэн нь sysroot.tar дотор)
  bin/clang.wasm, lld.wasm, memfs.wasm, sysroot.tar   (~60MB)
problems/
  index.json                     — tools/build_index.py үүсгэнэ (гараар засахгүй)
  <id>/problem.json              — гарчиг, хязгаар, дэд бодлого
  <id>/statement.md              — өгүүлбэр (Markdown + $LaTeX$)
  <id>/tests/                    — тестүүд
tools/build_index.py             — problems/index.json үүсгэгч
vendor/                          — KaTeX, marked, CodeMirror (CDN-гүй ажиллана)
```

## Шинэ бодлого нэмэх

1. `problems/<id>/` хавтас үүсгэнэ (`id` нь латин үсэг, тоо, `-`).
2. `problem.json`:
   ```json
   {
     "title": "Бодлогын нэр",
     "tl": 1.0,
     "ml": 256,
     "level": "Дунд",
     "tags": ["граф", "BFS"],
     "checker": "tokens",
     "samples": ["01", "02"],
     "subtasks": [
       { "score": 40, "name": "N ≤ 1000", "tests": ["01", "02", "03"] },
       { "score": 60, "tests": ["01", "02", "03", "04", "05"] }
     ]
   }
   ```
   - `tl` секундээр. Хөтөч native-аас 1.5–3 дахин удаан тул CMS-ийнхээс **2 дахин** их тавихыг зөвлөж байна.
   - `checker`: `tokens` (хоосон зайг үл тооно, анхны утга), `lines` (мөрөөр), `float:1e-6` (бодит тоо).
   - `subtasks` байхгүй бол оноо = зөв тестийн хувь. Байвал IOI-ийн журмаар: дэд бодлогын бүх тест зөв бол оноогоо авна.
3. `statement.md` — Markdown. Томьёо: `$...$`, `$$...$$`. Жишээг `samples`-аас автоматаар харуулна.
4. Тестүүдийг `tests/` дотор хийнэ. Таних нэршлүүд:
   `01.in`/`01.out`, `01.in`/`01.ans`, `input01.txt`/`output01.txt`,
   CMS-ийн `input/input0.txt`/`output/output0.txt`, Polygon-ийн `01`/`01.a`.
5. `python3 tools/build_index.py` ажиллуулна (Netlify дээр deploy хийх бүрт автоматаар ажиллана).

## Байршуулах (Netlify)

1. Энэ хавтсыг GitHub repo болгож push хийнэ (`clang.wasm` 31MB, GitHub-ийн 100MB хязгаараас бага).
2. Netlify → *Add new site → Import from Git* → repo-г сонгоно. Тохиргоо `netlify.toml` дотор байгаа.
3. Эсвэл: `python3 tools/build_index.py` ажиллуулаад хавтсыг Netlify Drop руу чирнэ.

Локалаар турших: `python3 -m http.server 8000` → http://localhost:8000
(`file://`-ээр нээвэл Worker ажиллахгүй.)

## Хөрвүүлэгчийн онцлог (оролцогчдод хэлэх)

- **clang 8, C++17**, `-O2`, `ONLINE_JUDGE` тодорхойлогдсон, `#include <bits/stdc++.h>` ажиллана.
- **32 битийн орчин (wasm32):** `long` болон `size_t` нь **32 бит**. Том тоонд `long long` ашиглах.
- **Exception (`try`/`throw`) дэмжихгүй**, thread (`<thread>`) байхгүй.
- `cin`/`cout`-ийг хурдасгасан (2×10⁵ тоо ~0.15с) ч `scanf` уншихдаа ойролцоогоор 5–7 дахин хурдан хэвээр. 10⁶-аас их тоо уншдаг бодлогод `scanf` санал болгох эсвэл TL-ийг өсгөх.
- `endl` нь тусдаа flush хийхгүй тул удаашруулахгүй. `cin` болон `scanf`/`getchar` холиход зөв ажиллана.
- Stack 64MB (гүн рекурс ажиллана). Санах ойн хязгаар нь `ml`-ээр тогтоогдоно; хэтэрвэл `MLE`/`RE`.
- Ажиллах хугацааг хөтөч хэмждэг тул компьютерээс хамаарч зөрүүтэй гарна.

## Аюулгүй байдлын тухай

Тестүүд хөтөч рүү татагддаг тул оролцогч DevTools-оос хариуг харж болно. Энэ нь **бэлтгэлийн**
сайтад тохиромжтой; албан ёсны тэмцээнд CMS ашиглана. Оноо зөвхөн тухайн хөтчийн `localStorage`-д хадгалагдана.

## Лиценз

`judge/shared.js`, `judge/bin/*` — [binji/wasm-clang](https://github.com/binji/wasm-clang) (Apache-2.0, LLVM лиценз: `judge/LICENSE*`).
`vendor/` — KaTeX (MIT), marked (MIT), CodeMirror 5 (MIT).
# onlinejudge_2026
# onlinejudge_2026
