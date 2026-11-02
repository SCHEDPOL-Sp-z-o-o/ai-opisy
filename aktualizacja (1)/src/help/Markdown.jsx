// Minimalny renderer Markdown dla instrukcji (nagłówki, akapity, listy, tabele, **pogrubienie**, `kod`, [link](url)) – bez innerHTML
import { Fragment } from 'react'
import { Link } from 'react-router-dom'

export const slugify = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function inline(text, key = 'i') {
  const out = []; let rest = String(text), i = 0
  const rx = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/
  while (rest.length) {
    const m = rest.match(rx)
    if (!m) { out.push(rest); break }
    if (m.index) out.push(rest.slice(0, m.index))
    const k = `${key}-${i++}`
    if (m[1]) out.push(<strong key={k}>{inline(m[2], k)}</strong>)
    else if (m[3]) out.push(<code key={k}>{m[4]}</code>)
    else if (m[5]) out.push(m[7].startsWith('/') ? <Link key={k} to={m[7]}>{m[6]}</Link> : <a key={k} href={m[7]} target="_blank" rel="noreferrer">{m[6]}</a>)
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

export default function Markdown({ text, highlight = '' }) {
  const lines = String(text).split('\n'), blocks = []
  for (let i = 0; i < lines.length;) {
    const l = lines[i]
    if (!l.trim()) { i++; continue }
    if (l.startsWith('### ')) { blocks.push({ t: 'h3', v: l.slice(4) }); i++; continue }
    if (l.startsWith('|')) { const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]); blocks.push({ t: 'table', v: rows.filter(r => !/^\|\s*-/.test(r)).map(r => r.split('|').slice(1, -1).map(c => c.trim())) }); continue }
    if (/^\d+\.\s/.test(l)) { const it = []; while (i < lines.length && /^\d+\.\s/.test(lines[i])) it.push(lines[i++].replace(/^\d+\.\s/, '')); blocks.push({ t: 'ol', v: it }); continue }
    if (l.startsWith('- ')) { const it = []; while (i < lines.length && lines[i].startsWith('- ')) it.push(lines[i++].slice(2)); blocks.push({ t: 'ul', v: it }); continue }
    const p = []; while (i < lines.length && lines[i].trim() && !/^(### |\||- |\d+\.\s)/.test(lines[i])) p.push(lines[i++]); blocks.push({ t: 'p', v: p.join(' ') })
  }
  const hl = highlight.trim().toLowerCase()
  const mark = s => hl && String(s).toLowerCase().includes(hl) ? ' hit' : ''
  return blocks.map((b, n) => {
    if (b.t === 'h3') return <h3 key={n} id={slugify(b.v)}>{inline(b.v, n)}</h3>
    if (b.t === 'p') return <p key={n} className={mark(b.v)}>{inline(b.v, n)}</p>
    if (b.t === 'ol' || b.t === 'ul') { const L = b.t; return <L key={n}>{b.v.map((x, j) => <li key={j} className={mark(x)}>{inline(x, `${n}-${j}`)}</li>)}</L> }
    if (b.t === 'table') return (
      <div key={n} className="table-wrap"><table className="compact help-table">
        <thead><tr>{b.v[0].map((c, j) => <th key={j}>{inline(c, `h${n}${j}`)}</th>)}</tr></thead>
        <tbody>{b.v.slice(1).map((r, j) => <tr key={j} className={mark(r.join(' '))}>{r.map((c, k) => <td key={k}>{inline(c, `${n}-${j}-${k}`)}</td>)}</tr>)}</tbody>
      </table></div>
    )
    return <Fragment key={n} />
  })
}
