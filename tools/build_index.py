#!/usr/bin/env python3
"""
problems/ хавтсыг уншиж problems/index.json үүсгэнэ.

Бодлого бүр:  problems/<id>/problem.json   (гарчиг, TL, ML, дэд бодлого...)
              problems/<id>/statement.md   (Markdown + $LaTeX$)
              problems/<id>/tests/         (тестүүд)

Дэмжих тестийн нэршил (автоматаар таньна):
  01.in / 01.out         01.in / 01.ans        1.in / 1.a
  input01.txt / output01.txt                    (CMS italy_yaml: input/input0.txt, output/output0.txt)
  input/1 , output/1     ( Polygon-ийн 01 / 01.a )

Хэрэглээ:  python3 tools/build_index.py         (сайтын үндсэн хавтаснаас)
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROB = os.path.join(ROOT, 'problems')

OUT_EXT = ['.out', '.ans', '.a', '.sol', '.res']


def natural_key(s):
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', s)]


def find_tests(pdir):
    """[(name, in_path, out_path)] — замууд problems/<id>/-ээс харьцангуй."""
    pairs = {}
    for dirpath, _, files in os.walk(pdir):
        for f in files:
            full = os.path.join(dirpath, f)
            rel = os.path.relpath(full, pdir).replace(os.sep, '/')
            if rel in ('problem.json', 'statement.md') or rel.startswith('solutions/'):
                continue
            base, ext = os.path.splitext(f)
            # 01.in / 01.out / 01.ans
            if ext == '.in':
                pairs.setdefault((dirpath, base), {})['in'] = rel
                continue
            if ext in OUT_EXT:
                pairs.setdefault((dirpath, base), {})['out'] = rel
                continue
            # input01.txt / output01.txt  (мөн input/input0.txt)
            m = re.fullmatch(r'(input|output)[._-]?(\d+)(\.txt)?', f)
            if m:
                key = (os.path.dirname(dirpath) if os.path.basename(dirpath) in ('input', 'output') else dirpath, m.group(2))
                pairs.setdefault(key, {})['in' if m.group(1) == 'input' else 'out'] = rel
                continue
            # Polygon: tests/01 + tests/01.a  (01.a дээр барьсан)
            if re.fullmatch(r'\d+', f):
                pairs.setdefault((dirpath, f), {})['in'] = rel
    tests = []
    for (d, name), p in pairs.items():
        if 'in' in p and 'out' in p:
            tests.append((name, p['in'], p['out']))
        else:
            print(f'  ! хос нь олдсонгүй: {name} {p}', file=sys.stderr)
    tests.sort(key=lambda t: natural_key(t[0]))
    return tests


def main():
    problems = []
    for pid in sorted(os.listdir(PROB), key=natural_key):
        pdir = os.path.join(PROB, pid)
        meta_path = os.path.join(pdir, 'problem.json')
        if not os.path.isfile(meta_path):
            continue
        with open(meta_path, encoding='utf-8') as fh:
            meta = json.load(fh)
        tests = find_tests(pdir)
        names = [t[0] for t in tests]
        for st in meta.get('subtasks', []):
            for t in st.get('tests', []):
                if t not in names:
                    print(f'  ! {pid}: дэд бодлогын тест "{t}" олдсонгүй', file=sys.stderr)
        problems.append({
            'id': pid,
            'title': meta.get('title', pid),
            'level': meta.get('level', ''),
            'tags': meta.get('tags', []),
            'tl': meta.get('tl', 1.0),
            'ml': meta.get('ml', 256),
            'checker': meta.get('checker', 'tokens'),
            'samples': meta.get('samples', names[:1]),
            'subtasks': meta.get('subtasks', []),
            'tests': [{'name': n, 'in': i, 'out': o} for n, i, o in tests],
        })
        print(f'{pid}: {len(tests)} тест')
    with open(os.path.join(PROB, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump(problems, fh, ensure_ascii=False, indent=1)
    print(f'problems/index.json — {len(problems)} бодлого')


if __name__ == '__main__':
    main()
