import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export type LineItemInput = {
  name: string
  ticketNumber: string
  pnr: string
  departureDate: string
  sector: string
  amount: string
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

const TEXT_COLOR = rgb(0, 0, 0)
/** Light rules like the template / mockup (not pure black). */
const RULE_COLOR = rgb(0.72, 0.72, 0.72)
const RULE_THICK = 0.55
const DOUBLE_GAP = 2.4
/** Full-width rules match existing template geometry (~21.4–572). */
const RULE_X0 = 21.5
const RULE_X1 = 572
/** Text row: words stop before this x; right block stays clear for Net Payable + amount. */
const WORDS_X = 25
const WORDS_MAX_RIGHT = 378
const AMOUNT_COL_RIGHT = 566.5
/**
 * Invoice values sit inline after the printed labels on template.pdf /
 * ticket_zone_template.pdf (measured from PDF text positions).
 */
const INVOICE_ID_VALUE_X = 451
const INVOICE_ID_VALUE_Y = 638
const INVOICE_DATE_VALUE_X = 458
const INVOICE_DATE_VALUE_Y = 625
/** First body row baseline; ~529 sits under the header grid bottom (~531). */
const TABLE_FIRST_ROW_Y = 529
const TABLE_ROW_STEP = 20
/** Vertical space from last line baseline to the first (single) rule below. */
const GAP_AFTER_ENTRIES = 26
/** Shift “Net Payable” left (PDF x decreases); widens gap before the figure. */
const NET_PAYABLE_NUDGE_LEFT = 28

function formatAmountCommas(n: number): string {
  return n.toLocaleString('en-US')
}

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const
const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
] as const

function under1000(n: number): string {
  if (n < 20) return ONES[n]
  if (n < 100) {
    const t = Math.floor(n / 10)
    const o = n % 10
    return o ? `${TENS[t]} ${ONES[o]}` : TENS[t]
  }
  const h = Math.floor(n / 100)
  const r = n % 100
  const rest = r ? ` ${under1000(r)}` : ''
  return `${ONES[h]} hundred${rest}`
}

/** Non-negative integer → English words (e.g. 1205 → "one thousand two hundred five"). */
export function integerAmountToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 999_999_999_999)
    return 'amount out of range'
  if (n === 0) return 'zero'
  const parts: string[] = []
  const scales = [
    { v: 1_000_000_000, s: 'billion' },
    { v: 1_000_000, s: 'million' },
    { v: 1_000, s: 'thousand' },
    { v: 1, s: '' },
  ] as const
  let rest = Math.floor(n)
  for (const { v, s } of scales) {
    if (rest >= v) {
      const c = Math.floor(rest / v)
      rest %= v
      const chunk = under1000(c)
      parts.push(s ? `${chunk} ${s}` : chunk)
    }
  }
  return parts.join(' ')
}

/** Receipt-style line: Rupees … only (title case). */
export function amountInWordsForReceipt(net: number): string {
  const core = integerAmountToWords(net)
  const titled = core
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
  return `Rupees ${titled} only`
}

function wrapToWidth(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = words[0]!
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!
    const next = `${line} ${w}`
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  lines.push(line)
  return lines
}

/** Matches Python date.today().strftime("%d-%b-%Y") with English month abbrev. */
export function formatReceiptDate(d: Date = new Date()): string {
  const day = String(d.getDate()).padStart(2, '0')
  const mon = MONTHS[d.getMonth()]
  return `${day}-${mon}-${d.getFullYear()}`
}

/** HTML `<input type="date">` value is YYYY-MM-DD; validate before generate. */
export function isValidHtmlDateValue(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return false
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

/** Same dd-Mon-YYYY style as the receipt header for the departure column. */
export function formatDepartureDateForPdf(isoYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoYmd.trim())
  if (!m) return isoYmd.trim()
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  const dayStr = String(d).padStart(2, '0')
  return `${dayStr}-${MONTHS[mo - 1]}-${y}`
}

/** Strip commas then parse as integer (Python int(amount.replace(",", ""))). */
export function parseAmountStrict(raw: string): number | null {
  const s = raw.replace(/,/g, '').trim()
  if (s === '' || !/^-?\d+$/.test(s)) return null
  return parseInt(s, 10)
}

/**
 * Tahoma at public/fonts/Tahoma.ttf if present; else Helvetica (same 9pt).
 * Tahoma is a Microsoft font — only bundle if your license allows it.
 */
async function embedBodyFont(pdfDoc: PDFDocument) {
  try {
    const res = await fetch('/fonts/Tahoma.ttf')
    if (!res.ok) throw new Error('Tahoma not found')
    const bytes = await res.arrayBuffer()
    return pdfDoc.embedFont(bytes, { subset: true })
  } catch {
    return pdfDoc.embedFont(StandardFonts.Helvetica)
  }
}

async function embedBoldFont(pdfDoc: PDFDocument) {
  try {
    const res = await fetch('/fonts/tahomabd.ttf')
    if (!res.ok) throw new Error('Tahoma bold not found')
    const bytes = await res.arrayBuffer()
    return pdfDoc.embedFont(bytes, { subset: true })
  } catch {
    return pdfDoc.embedFont(StandardFonts.HelveticaBold)
  }
}

/**
 * Build receipt PDF: paint the template as an embedded page, then draw text on a
 * clean page. Some templates (e.g. Ticket Zone with heavy images / transparency)
 * do not composite appended content streams reliably when edited in-place;
 * embedPage + drawPage matches PyPDF2 merge_page behavior more robustly.
 */
export async function buildReceiptPdf(
  templateBytes: ArrayBuffer,
  serial: number,
  lines: LineItemInput[],
): Promise<Uint8Array> {
  const templateDoc = await PDFDocument.load(templateBytes)
  const templatePage = templateDoc.getPage(0)
  const { width, height } = templatePage.getSize()

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([width, height])
  const embeddedTemplate = await pdfDoc.embedPage(templatePage)
  page.drawPage(embeddedTemplate, { x: 0, y: 0, width, height })

  pdfDoc.registerFontkit(fontkit)
  const font = await embedBodyFont(pdfDoc)
  const fontBold = await embedBoldFont(pdfDoc)
  const size = 9

  const dateStr = formatReceiptDate()

  page.drawText(String(serial), {
    x: INVOICE_ID_VALUE_X,
    y: INVOICE_ID_VALUE_Y,
    size,
    font,
    color: TEXT_COLOR,
  })
  page.drawText(dateStr, {
    x: INVOICE_DATE_VALUE_X,
    y: INVOICE_DATE_VALUE_Y,
    size,
    font,
    color: TEXT_COLOR,
  })

  let y = TABLE_FIRST_ROW_Y
  for (let i = 0; i < lines.length; i++) {
    const row = lines[i]
    const idx = i + 1
    page.drawText(String(idx), { x: 25, y, size, font, color: TEXT_COLOR })
    page.drawText(row.name, { x: 50, y, size, font, color: TEXT_COLOR })
    page.drawText(row.ticketNumber, {
      x: 194,
      y,
      size,
      font,
      color: TEXT_COLOR,
    })
    page.drawText(row.pnr, { x: 280, y, size, font, color: TEXT_COLOR })
    page.drawText(formatDepartureDateForPdf(row.departureDate), {
      x: 340,
      y,
      size,
      font,
      color: TEXT_COLOR,
    })
    page.drawText(row.sector, { x: 415, y, size, font, color: TEXT_COLOR })
    page.drawText(row.amount, { x: 520, y, size, font, color: TEXT_COLOR })
    y -= TABLE_ROW_STEP
  }

  const lastRowY = y
  let net = 0
  for (const row of lines) {
    net += parseAmountStrict(row.amount) ?? 0
  }

  const lastRowBaseline =
    lines.length > 0 ? lastRowY + TABLE_ROW_STEP : TABLE_FIRST_ROW_Y
  const ySingleTop = lastRowBaseline - GAP_AFTER_ENTRIES

  page.drawLine({
    start: { x: RULE_X0, y: ySingleTop },
    end: { x: RULE_X1, y: ySingleTop },
    thickness: RULE_THICK,
    color: RULE_COLOR,
  })

  const wordsLine = amountInWordsForReceipt(net)
  const maxWordsWidth = WORDS_MAX_RIGHT - WORDS_X
  const wordsLines = wrapToWidth(wordsLine, font, size, maxWordsWidth)
  const wordLineStep = 11
  const yTextTop = ySingleTop - 10
  for (let li = 0; li < wordsLines.length; li++) {
    page.drawText(wordsLines[li]!, {
      x: WORDS_X,
      y: yTextTop - li * wordLineStep,
      size,
      font,
      color: TEXT_COLOR,
    })
  }
  const yLastWordBaseline =
    yTextTop - Math.max(0, wordsLines.length - 1) * wordLineStep

  const amtStr = formatAmountCommas(net)
  const wAmt = font.widthOfTextAtSize(amtStr, size)
  const label = 'Net Payable'
  const wLabel = fontBold.widthOfTextAtSize(label, size)
  const gapLabelAmount = 10
  const xAmountRight = AMOUNT_COL_RIGHT
  const xAmount = xAmountRight - wAmt
  const xLabel = xAmount - gapLabelAmount - wLabel - NET_PAYABLE_NUDGE_LEFT

  page.drawText(label, {
    x: xLabel,
    y: yLastWordBaseline,
    size,
    font: fontBold,
    color: TEXT_COLOR,
  })
  page.drawText(amtStr, {
    x: xAmount,
    y: yLastWordBaseline,
    size,
    font,
    color: TEXT_COLOR,
  })

  const paddingBeforeDouble = 10
  const yDoubleUpper = yLastWordBaseline - paddingBeforeDouble
  const yDoubleLower = yDoubleUpper - DOUBLE_GAP

  page.drawLine({
    start: { x: RULE_X0, y: yDoubleUpper },
    end: { x: RULE_X1, y: yDoubleUpper },
    thickness: RULE_THICK,
    color: RULE_COLOR,
  })
  page.drawLine({
    start: { x: RULE_X0, y: yDoubleLower },
    end: { x: RULE_X1, y: yDoubleLower },
    thickness: RULE_THICK,
    color: RULE_COLOR,
  })

  return pdfDoc.save({ useObjectStreams: false })
}
