// Diagram przepływu pracy (ten sam co w dokumencie instrukcji), w kolorach aplikacji
export default function Workflow() {
  const W = 160, H = 72, c1 = 116, c2 = 292, c3 = 468, c4 = 644, yA = 64, yB = 200, yC = 344, bus = 168
  const edge = 'var(--line)', accent = 'var(--action)', ink = 'var(--ink)', quiet = 'var(--ink-soft)'
  const box = (cx, y0, kind) => <rect x={cx - W / 2} y={y0} width={W} height={H} rx="8" fill={kind === 'main' ? accent : kind === 'end' ? 'var(--stone)' : 'var(--surface)'} fillOpacity={kind === 'main' ? 0.1 : 1} stroke={kind === 'main' ? accent : edge} strokeWidth={kind === 'main' ? 2 : 1.25} />
  const label = (cx, y0, name, a, b, strong) => <>
    <text x={cx} y={y0 + 24} textAnchor="middle" fontWeight="600" fill={ink}>{name}</text>
    <text x={cx} y={y0 + 42} textAnchor="middle" fontSize="11.5" fill={strong ? ink : quiet}>{a}</text>
    <text x={cx} y={y0 + 58} textAnchor="middle" fontSize="11.5" fill={strong ? ink : quiet}>{b}</text>
  </>
  return (
    <svg className="help-diagram" viewBox="0 0 760 440" role="img" aria-label="Opis trafia do Base dopiero po weryfikacji człowieka" fontSize="13">
      <defs><marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={edge} /></marker></defs>
      <text x="36" y="34" fontSize="15" fontWeight="600" fill={ink}>Opis trafia do Base dopiero po weryfikacji człowieka</text>
      <g fill="none" stroke={edge} strokeWidth="1.25">
        <path d={`M${c1} ${yA + H}V${bus}`} /><path d={`M${c2} ${yA + H}V${bus}`} /><path d={`M${c3} ${yA + H}V${bus}`} /><path d={`M${c4} ${yA + H}V${bus}H${c1}`} />
        <path d={`M${c1} ${bus}V${yB}`} markerEnd="url(#wf-arrow)" />
        <path d={`M${c1 + W / 2} ${yB + H / 2}H${c2 - W / 2}`} markerEnd="url(#wf-arrow)" />
        <path d={`M${c2 + W / 2} ${yB + H / 2}H${c3 - W / 2}`} markerEnd="url(#wf-arrow)" />
        <path d={`M${c3 + W / 2} ${yB + H / 2}H${c4 - W / 2}`} markerEnd="url(#wf-arrow)" />
        <path d={`M${c2} ${yB + H}V${yB + H + 24}H${c1}V${yB + H}`} markerEnd="url(#wf-arrow)" />
        <path d={`M${c4} ${yB + H}V${yC}`} markerEnd="url(#wf-arrow)" />
        <path d={`M${c3 + W / 2} ${yC + H / 2}H${c4 - W / 2}`} markerEnd="url(#wf-arrow)" />
      </g>
      {box(c1, yA)}{label(c1, yA, '1. Dane produktu', 'PIM i import z Base', 'ekran Produkty')}
      {box(c2, yA)}{label(c2, yA, '2. Wiedza', 'fakty ze źródeł', 'zatwierdza akceptujący')}
      {box(c3, yA)}{label(c3, yA, '3. Frazy kluczowe', 'bank per kategoria', 'i język rynku')}
      {box(c4, yA)}{label(c4, yA, '4. Szablon', 'per rynek i kategoria', 'ustawia admin')}
      {box(c1, yB)}{label(c1, yB, '5. Generacja', 'opis bazowy (AI)', 'ekran Produkty')}
      {box(c2, yB, 'main')}{label(c2, yB, '6. Weryfikacja', 'treść + tłumaczenie PL', 'akceptujący', true)}
      {box(c3, yB)}{label(c3, yB, '7. Warianty', 'auto-akceptacja po QA', 'reszta do weryfikacji')}
      {box(c4, yB)}{label(c4, yB, '8. Publikacja', 'do Baselinkera', 'admin')}
      {box(c3, yC)}{label(c3, yC, '9. Parametry Base', 'dane z PIM, 13 języków', 'porównanie i zapis')}
      {box(c4, yC, 'end')}{label(c4, yC, 'Base i marketplace', 'opisy i parametry', 'trafiają do kanałów')}
      <text x={(c1 + c2) / 2} y={yB + H + 42} textAnchor="middle" fontSize="11.5" fill={quiet}>poprawki: ponowna generacja</text>
    </svg>
  )
}
