// Tiny safe arithmetic evaluator (shunting-yard). No eval.
// Supports + - * / ^ ( ) and numbers with k / m / b suffixes.

const SUFFIX = { k: 1e3, m: 1e6, b: 1e9 }

function tokenize(src) {
  const out = []
  const re = /\s*([0-9]*\.?[0-9]+(?:[kmb])?|[+\-*/^()])\s*/giy
  let pos = 0
  while (pos < src.length) {
    re.lastIndex = pos
    const m = re.exec(src)
    if (!m || m.index !== pos) throw new Error(`unexpected "${src.slice(pos, pos + 8).trim()}"`)
    pos = re.lastIndex
    const t = m[1].toLowerCase()
    if (/[0-9]/.test(t[0])) {
      const suf = SUFFIX[t.at(-1)]
      out.push({ n: suf ? parseFloat(t) * suf : parseFloat(t) })
    } else {
      out.push({ op: t })
    }
  }
  return out
}

const PREC = { '^': 4, '*': 3, '/': 3, '+': 2, '-': 2 }
const RIGHT = new Set(['^'])

function toRPN(tokens) {
  const out = []
  const ops = []
  for (const tk of tokens) {
    if (tk.n != null) { out.push(tk); continue }
    if (tk.op === '(') { ops.push(tk); continue }
    if (tk.op === ')') {
      while (ops.length && ops.at(-1).op !== '(') out.push(ops.pop())
      if (!ops.length) throw new Error('mismatched )')
      ops.pop()
      continue
    }
    while (
      ops.length && ops.at(-1).op !== '(' &&
      (PREC[ops.at(-1).op] > PREC[tk.op] ||
        (PREC[ops.at(-1).op] === PREC[tk.op] && !RIGHT.has(tk.op)))
    ) out.push(ops.pop())
    ops.push(tk)
  }
  while (ops.length) {
    const o = ops.pop()
    if (o.op === '(') throw new Error('mismatched (')
    out.push(o)
  }
  return out
}

export function calc(src) {
  const rpn = toRPN(tokenize(src))
  const st = []
  for (const tk of rpn) {
    if (tk.n != null) { st.push(tk.n); continue }
    const b = st.pop()
    const a = st.pop()
    if (a == null || b == null) throw new Error('malformed expression')
    switch (tk.op) {
      case '+': st.push(a + b); break
      case '-': st.push(a - b); break
      case '*': st.push(a * b); break
      case '/': st.push(a / b); break
      case '^': st.push(a ** b); break
      default: throw new Error(`bad op ${tk.op}`)
    }
  }
  if (st.length !== 1 || !Number.isFinite(st[0])) throw new Error('malformed expression')
  return st[0]
}
