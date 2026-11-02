import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

// Diagram asortymentu: kategoria → technologia → model → kolor → kształt → rozmiar → odpływ → SKU.
// Puste poziomy są pomijane (np. odpływy liniowe nie mają „umiejscowienia odpływu”).
export const LEVELS = ['Kategoria', 'Technologia', 'Model', 'Kolor', 'Kształt', 'Rozmiar', 'Odpływ']
const SKU_COL = LEVELS.length + 1
const COL = 236, NODE_W = 200, NODE_H = 46, ROW = 56, PAD_X = 16, PAD_Y = 40
const STATUS = {
  opublikowany: { label: 'opublikowany', cls: 'st-pub' }, zaakceptowany: { label: 'zaakceptowany', cls: 'st-acc' },
  do_weryfikacji: { label: 'do weryfikacji', cls: 'st-rev' }, poprawki: { label: 'poprawki', cls: 'st-rev' }, blad: { label: 'błąd', cls: 'st-err' },
  generowanie: { label: 'generowanie', cls: 'st-rev' }, brak_opisu: { label: 'brak opisu', cls: 'st-none' }, poza_aplikacja: { label: 'poza aplikacją', cls: 'st-none' },
}
const sortVals = (a, b) => {
  const na = a.match(/^(\d+)\s*x\s*(\d+)/), nb = b.match(/^(\d+)\s*x\s*(\d+)/)
  if (na && nb) return (na[1] * 1000 + +na[2]) - (nb[1] * 1000 + +nb[2])
  return a.localeCompare(b, 'pl')
}

function build(items) {
  const root = { id: 'root', label: 'Asortyment', level: -1, children: new Map(), skus: [] }
  for (const it of items) {
    let n = root, path = 'root'
    it.levels.forEach((v, li) => {
      if (!v) return
      path += `|${li}:${v}`
      if (!n.children.has(path)) n.children.set(path, { id: path, label: v, level: li, children: new Map(), skus: [] })
      n = n.children.get(path)
    })
    n.skus.push(it)
  }
  const fin = n => {
    n.kids = [...n.children.values()].sort((a, b) => sortVals(a.label, b.label)).map(fin)
    n.all = [...n.skus, ...n.kids.flatMap(k => k.all)]
    return n
  }
  return fin(root)
}

export default function TreeDiagram({ items, channel, channelLabel }) {
  const tree = useMemo(() => build(items), [items])
  const [open, setOpen] = useState(() => new Set(['root']))
  const toggle = id => setOpen(s => { const n = new Set(s); if (n.has(id)) { [...n].forEach(x => { if (x === id || x.startsWith(id + '|')) n.delete(x) }) } else n.add(id); return n })
  const expandTo = depth => {
    const n = new Set(['root'])
    const walk = node => node.kids.forEach(k => { if (k.level < depth) { n.add(k.id); walk(k) } })
    walk(tree); setOpen(n)
  }

  // układ: liście (widoczne) jeden pod drugim, rodzic na środku swoich dzieci; kolumna = poziom
  const { nodes, links, height, width } = useMemo(() => {
    const nodes = [], links = []
    let row = 0, maxCol = 0
    const place = (n, depthCol) => {
      const col = n.level + 1
      maxCol = Math.max(maxCol, col)
      const kids = open.has(n.id) ? [...n.kids, ...(n.skus.length ? [{ id: n.id + '|sku', sku: true, list: n.skus, level: LEVELS.length }] : [])] : []
      let y
      if (!kids.length) { y = row * ROW; row += n.sku ? n.list.length : 1 }
      else {
        const ys = kids.map(k => place(k, col)); y = (ys[0] + ys[ys.length - 1]) / 2
        // do grupy SKU: osobna linia do każdego SKU
        kids.forEach((k, i) => k.sku ? k.list.forEach((it, j) => links.push({ from: n, to: { sku: true, id: k.id + it.sku }, y1: y, y2: k.y0 + j * ROW })) : links.push({ from: n, to: k, y1: y, y2: ys[i] }))
      }
      n.y = y; n.x = col * COL
      if (n.sku) { n.y0 = y; maxCol = Math.max(maxCol, SKU_COL); n.x = SKU_COL * COL; n.list.forEach((it, i) => nodes.push({ sku: true, it, x: n.x, y: y + i * ROW, id: n.id + it.sku })) }
      else nodes.push(n)
      if (n.sku) n.y = y + ((n.list.length - 1) * ROW) / 2
      return n.sku ? y + ((n.list.length - 1) * ROW) / 2 : y
    }
    place(tree, 0)
    return { nodes, links, height: Math.max(row, 1) * ROW + PAD_Y * 2, width: (maxCol + 1) * COL + NODE_W }
  }, [tree, open])

  const cov = n => { const total = n.all.length, done = n.all.filter(x => x.sts[channel] === 'opublikowany').length; return { total, done, pct: total ? done / total : 0 } }
  const linkPath = l => {
    const x1 = l.from.x + NODE_W + PAD_X, x2 = (l.to.sku ? SKU_COL * COL : l.to.x) + PAD_X, y1 = l.y1 + PAD_Y + NODE_H / 2, y2 = l.y2 + PAD_Y + NODE_H / 2, mx = (x1 + x2) / 2
    return `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
  }

  return (
    <div className="panel diagram-panel">
      <div className="diagram-tools">
        <span className="muted small">Rozwiń do poziomu:</span>
        {LEVELS.map((l, i) => <button key={l} className="link-dark small" onClick={() => expandTo(i)}>{l.toLowerCase()}</button>)}
        <button className="link-dark small" onClick={() => setOpen(new Set(['root']))}>zwiń</button>
        <span className="muted small diagram-legend">pasek = opublikowane w {channelLabel} · <i className="dot st-pub" /> opublikowany <i className="dot st-acc" /> zaakceptowany <i className="dot st-rev" /> do weryfikacji <i className="dot st-none" /> brak opisu</span>
      </div>
      <div className="diagram-scroll">
        <div className="diagram-cols" style={{ width }}>
          {['Asortyment', ...LEVELS, 'SKU'].map((l, i) => <span key={l} style={{ left: i * COL + PAD_X, width: NODE_W }}>{l}</span>)}
        </div>
        <svg className="tree-diagram" width={width} height={height} role="tree" aria-label="Diagram asortymentu">
          <g className="links">{links.map(l => <path key={l.from.id + '>' + l.to.id} d={linkPath(l)} />)}</g>
          {nodes.map(n => {
            if (n.sku) {
              const st = n.it.sts[channel] || 'brak_opisu', meta = STATUS[st] || STATUS.brak_opisu, did = n.it.descId?.[channel]
              const body = (
                <g className={`dnode sku ${meta.cls}`} style={{ transform: `translate(${n.x + PAD_X}px, ${n.y + PAD_Y}px)` }}>
                  <rect width={NODE_W} height={NODE_H} rx="8" />
                  <circle cx="14" cy={NODE_H / 2} r="5" className="sku-dot" />
                  <text x="26" y="19" className="d-label mono">{n.it.sku}</text>
                  <text x="26" y="35" className="d-meta">{meta.label}{did ? ' · otwórz opis' : ''}</text>
                  <title>{n.it.name}</title>
                </g>
              )
              return did ? <Link key={n.id} to={`/weryfikacja/${did}`} role="treeitem">{body}</Link> : <g key={n.id} role="treeitem">{body}</g>
            }
            const c = cov(n), isOpen = open.has(n.id), hasKids = n.kids?.length || n.skus?.length
            // krótsza etykieta: nagłówek kolumny mówi, co to za poziom; pełna nazwa w podpowiedzi
            let short = n.label
            if (n.level === 6) short = short.replace(/^odpływ\s+/i, '')
            if (n.level === 3) short = short.replace(/\s*\(.*?\)\s*/g, ' ').trim()
            const label = short.length > 22 ? short.slice(0, 21).trimEnd() + '…' : short
            return (
              <g key={n.id} className={`dnode${isOpen ? ' open' : ''}${n.id === 'root' ? ' root' : ''}`} style={{ transform: `translate(${n.x + PAD_X}px, ${n.y + PAD_Y}px)` }}
                role="treeitem" aria-expanded={hasKids ? isOpen : undefined} tabIndex={hasKids ? 0 : -1}
                onClick={() => hasKids && toggle(n.id)} onKeyDown={e => { if (hasKids && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(n.id) } }}>
                <rect width={NODE_W} height={NODE_H} rx="8" />
                <text x="12" y="19" className="d-label">{label}</text>
                <text x="12" y="35" className="d-meta">{c.total} SKU · {c.done} opubl.</text>
                <rect className="d-bar-bg" x="120" y="29" width="66" height="5" rx="2.5" />
                <rect className="d-bar" x="120" y="29" width={Math.max(c.done ? 3 : 0, 66 * c.pct)} height="5" rx="2.5" />
                {hasKids ? <text x={NODE_W - 14} y="20" className="d-caret">{isOpen ? '−' : '+'}</text> : null}
                <title>{n.label}</title>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
