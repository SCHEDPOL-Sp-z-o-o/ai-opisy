// Szablony kanałów (eMAG MCS): odczyt pól, wymagań i list dozwolonych wartości; eksport – wpisanie wierszy do oryginalnego pliku.
// Listy wyboru w pliku eMAG obejmują 150 tys. wierszy – zamiast przepisywać skoroszyt (biblioteki rozwijają je komórka po komórce),
// czytamy i zmieniamy bezpośrednio XML arkusza. Reszta pliku (listy, style, pozostałe arkusze) zostaje nietknięta.
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

const colIndex = l => l.split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
const colLetter = i => { let s = ''; for (; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s }
const xmlText = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

async function sheetPaths(zip) {
  const wb = await zip.file('xl/workbook.xml').async('string'), rels = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const relMap = Object.fromEntries([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => [m[0].match(/Id="([^"]+)"/)[1], m[0].match(/Target="([^"]+)"/)[1]]))
  return Object.fromEntries([...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => { const name = xmlText(m[0].match(/name="([^"]+)"/)[1]); const rid = m[0].match(/r:id="([^"]+)"/)[1]; const t = relMap[rid].replace(/^\/?(xl\/)?/, ''); return [name, 'xl/' + t] }))
}

const LEGAL = new Set(['safety_information', 'manufacturer_name', 'manufacturer_address', 'manufacturer_email', 'responsible_name', 'responsible_address', 'responsible_email'])

// Odczyt szablonu: pola z arkusza „Template” (wiersz 1 grupa, 3 kod, 4 wymaganie, 5 nazwa) + listy z walidacji
export async function parseTemplate(buffer) {
  const zip = await JSZip.loadAsync(buffer), paths = await sheetPaths(zip)
  const wb = XLSX.read(buffer, { type: 'array' })
  const tplName = Object.keys(paths).find(n => /^template$/i.test(n.trim())); if (!tplName) throw new Error('W pliku nie ma arkusza „Template” – to nie jest szablon eMAG')
  const ws = wb.Sheets[tplName], range = XLSX.utils.decode_range(ws['!ref'])
  const cell = (r, c) => { const v = ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })]; return v ? String(v.v).trim() : '' }
  // listy z walidacji danych
  const xml = await zip.file(paths[tplName]).async('string'), lists = {}
  for (const m of xml.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g)) {
    if (!/type="list"/.test(m[1])) continue
    const sq = (m[1].match(/sqref="([^"]+)"/) || [])[1]; const f = xmlText((m[2].match(/<formula1>([\s\S]*?)<\/formula1>/) || [])[1] || '')
    if (!sq || !f) continue
    let values = []
    if (/^".*"$/.test(f)) values = f.slice(1, -1).split(',').map(x => x.trim())
    else { const r = f.match(/^'?(.+?)'?!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/); if (r && wb.Sheets[r[1]]) { const s = wb.Sheets[r[1]]; for (let i = Number(r[3]); i <= Number(r[5]); i++) { const v = s[`${r[2]}${i}`]; if (v && String(v.v).trim()) values.push(String(v.v).trim()) } } }
    for (const part of sq.split(/\s+/)) { const c = part.match(/^([A-Z]+)/)[1]; lists[c] = values }
  }
  const fields = []; let group = ''
  for (let c = 1; c <= range.e.c + 1; c++) {
    if (cell(1, c)) group = cell(1, c)
    const code = cell(3, c); if (!code) continue
    const req = cell(4, c), col = colLetter(c), values = lists[col] || null
    // wymagania: „Mandatory” = obowiązkowe; „Optional/Mandatory” = warunkowe; pola prawne (GPSR) rozpoznajemy po kodzie,
    // bo w plikach eMAG wiersz wymagań bywa przesunięty o kolumnę w końcowej części arkusza
    const legal = LEGAL.has(code)
    fields.push({ col, code, label: cell(5, c) || code, group, req: legal ? 'Legal' : req, mandatory: legal || /^mandatory/i.test(req), conditional: /optional\/mandatory/i.test(req), restrictive: /restrictiv/i.test(req), values })
  }
  const startRow = 6
  return { fields, startRow, sheet: tplName }
}

// Eksport: wiersze [{ [col]: wartość }] wpisane od startRow do arkusza Template w kopii oryginału
export async function fillTemplate(buffer, rows, { sheet = 'Template', startRow = 6, numeric = [] } = {}) {
  const zip = await JSZip.loadAsync(buffer), paths = await sheetPaths(zip)
  const name = Object.keys(paths).find(n => n.trim().toLowerCase() === sheet.toLowerCase()); const p = paths[name]
  let xml = await zip.file(p).async('string')
  const num = new Set(numeric)
  // usuń istniejące wiersze danych (od startRow), zostaw nagłówki
  xml = xml.replace(/<row\b[^>]*\br="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g, (m, r) => Number(r) >= startRow ? '' : m)
  const out = rows.map((row, i) => {
    const r = startRow + i
    const cells = Object.entries(row).filter(([, v]) => v !== null && v !== undefined && String(v) !== '').sort((a, b) => colIndex(a[0]) - colIndex(b[0]))
      .map(([c, v]) => num.has(c) && /^-?\d+(\.\d+)?$/.test(String(v)) ? `<c r="${c}${r}"><v>${v}</v></c>` : `<c r="${c}${r}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`)
    return `<row r="${r}">${cells.join('')}</row>`
  }).join('')
  if (/<sheetData\s*\/>/.test(xml)) xml = xml.replace(/<sheetData\s*\/>/, `<sheetData>${out}</sheetData>`)
  else xml = xml.replace('</sheetData>', out + '</sheetData>')
  const last = startRow + rows.length - 1
  xml = xml.replace(/<dimension ref="([A-Z]+\d+):([A-Z]+)\d+"\s*\/>/, (m, a, b) => `<dimension ref="${a}:${b}${Math.max(last, 5)}"/>`)
  zip.file(p, xml)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' })
}
