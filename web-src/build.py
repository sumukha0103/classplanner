import sys, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
def rd(n): return open(os.path.join(HERE, n), encoding='utf-8').read()
t = rd('app.template.html')
p = rd('parser.js')
p += '\n' + rd('export.js')
p += '\n' + rd('crypto.js')
# drop the node-only export line
p = "\n".join(l for l in p.split("\n") if not l.startswith("if (typeof module"))
t = t.replace("'/*BUILD*/'", repr(os.environ.get('BUILD_NUM', 'dev')))
assert '/*PARSER*/' in t
if len(sys.argv) > 1 and sys.argv[1] == 'apk':
    # offline phone build: no CDN font/script, bundled xlsx reader, full document skeleton
    t = re.sub(r'<link rel="stylesheet" href="https://fonts[^>]*>\n', '', t)
    t = t.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>',
                  '<script>\n' + rd('xlsx-lite.js') + '\n</script>')
    assert 'cdnjs' not in t and 'fonts.googleapis' not in t
    head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            '<meta name="color-scheme" content="light dark">\n</head>\n<body>\n')
    out = head + t.replace('/*PARSER*/', p) + '\n</body>\n</html>\n'
    dest = os.path.join(HERE, '..', 'app', 'src', 'main', 'assets', 'index.html')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, 'w', encoding='utf-8').write(out)
    print('built apk web', len(out), 'bytes')
else:
    open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(t.replace('/*PARSER*/', p))
    print('built', len(t) + len(p), 'bytes')
