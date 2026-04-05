import { useMemo, useState } from 'react'
import './App.css'
import {
  buildReceiptPdf,
  isValidHtmlDateValue,
  parseAmountStrict,
  type LineItemInput,
} from './receiptPdf'
import { readSerial, writeSerial } from './serialStorage'

type TemplateId = 'kmc' | 'ticketZone'

const TEMPLATE_PATH: Record<TemplateId, string> = {
  kmc: '/template.pdf',
  ticketZone: '/ticket_zone_template.pdf',
}

type LineRow = LineItemInput & { id: string }

function emptyLine(): LineRow {
  return {
    id: crypto.randomUUID(),
    name: '',
    ticketNumber: '',
    pnr: '',
    departureDate: '',
    sector: '',
    amount: '',
  }
}

function toInputs(rows: LineRow[]): LineItemInput[] {
  return rows.map((row) => {
    const { id: _unused, ...rest } = row
    void _unused
    return rest
  })
}

function validate(
  lines: LineRow[],
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (lines.length === 0) {
    errors.push('Add at least one line item.')
  }
  lines.forEach((row, i) => {
    const n = i + 1
    if (!row.name.trim()) errors.push(`Row ${n}: Name is required.`)
    if (!row.ticketNumber.trim())
      errors.push(`Row ${n}: Ticket number is required.`)
    if (!row.pnr.trim()) errors.push(`Row ${n}: PNR is required.`)
    if (!row.departureDate.trim())
      errors.push(`Row ${n}: Departure date is required.`)
    else if (!isValidHtmlDateValue(row.departureDate))
      errors.push(`Row ${n}: Departure date is not a valid date.`)
    if (!row.sector.trim())
      errors.push(`Row ${n}: Sector / description is required.`)
    if (!row.amount.trim()) errors.push(`Row ${n}: Amount is required.`)
    else if (parseAmountStrict(row.amount) === null)
      errors.push(
        `Row ${n}: Amount must be a whole number (commas allowed, no decimals).`,
      )
  })
  return errors.length ? { ok: false, errors } : { ok: true }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [template, setTemplate] = useState<TemplateId>('kmc')
  const [lines, setLines] = useState<LineRow[]>(() => [emptyLine()])
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const lineLabels = useMemo(
    () => [
      'Name',
      'Ticket number',
      'PNR',
      'Departure date',
      'Sector / description',
      'Amount',
    ],
    [],
  )

  const updateLine = (
    index: number,
    field: keyof LineItemInput,
    value: string,
  ) => {
    setLines((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    )
  }

  const addLine = () => setLines((prev) => [...prev, emptyLine()])

  const removeLine = (index: number) => {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    )
  }

  const handleGenerate = async () => {
    setErrors([])
    setFetchError(null)
    const v = validate(lines)
    if (!v.ok) {
      setErrors(v.errors)
      return
    }

    const path = TEMPLATE_PATH[template]
    const currentSerial = readSerial()

    setBusy(true)
    try {
      const res = await fetch(path)
      if (!res.ok) {
        setFetchError(
          `Could not load template (${path}). Place template PDFs in public/.`,
        )
        return
      }
      const templateBytes = await res.arrayBuffer()
      const pdfBytes = await buildReceiptPdf(
        templateBytes,
        currentSerial,
        toInputs(lines),
      )
      const blob = new Blob([pdfBytes as BlobPart], {
        type: 'application/pdf',
      })
      downloadBlob(blob, `${currentSerial}.pdf`)
      writeSerial(currentSerial + 1)
    } catch (e) {
      setFetchError(
        e instanceof Error ? e.message : 'Failed to generate PDF.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Receipt generator</h1>
      </header>

      <section className="card">
        <h2>Template</h2>
        <div className="radios" role="radiogroup" aria-label="Template">
          <label className="radio">
            <input
              type="radio"
              name="template"
              checked={template === 'kmc'}
              onChange={() => setTemplate('kmc')}
            />
            KMC
          </label>
          <label className="radio">
            <input
              type="radio"
              name="template"
              checked={template === 'ticketZone'}
              onChange={() => setTemplate('ticketZone')}
            />
            Ticket Zone
          </label>
        </div>
      </section>

      <section className="card">
        <div className="cardHead">
          <h2>Line items</h2>
          <button type="button" className="btn secondary" onClick={addLine}>
            Add line
          </button>
        </div>

        {lines.map((row, index) => (
          <fieldset key={row.id} className="lineBlock">
            <legend className="lineLegend">Line {index + 1}</legend>
            {lines.length > 1 && (
              <button
                type="button"
                className="btn link removeLine"
                onClick={() => removeLine(index)}
              >
                Remove
              </button>
            )}
            <div className="grid">
              <label>
                <span>{lineLabels[0]}</span>
                <input
                  value={row.name}
                  onChange={(e) => updateLine(index, 'name', e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label>
                <span>{lineLabels[1]}</span>
                <input
                  value={row.ticketNumber}
                  onChange={(e) =>
                    updateLine(index, 'ticketNumber', e.target.value)
                  }
                  autoComplete="off"
                />
              </label>
              <label>
                <span>{lineLabels[2]}</span>
                <input
                  value={row.pnr}
                  onChange={(e) => updateLine(index, 'pnr', e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label>
                <span>{lineLabels[3]}</span>
                <input
                  type="date"
                  value={row.departureDate}
                  onChange={(e) =>
                    updateLine(index, 'departureDate', e.target.value)
                  }
                  autoComplete="off"
                />
              </label>
              <label>
                <span>{lineLabels[4]}</span>
                <input
                  value={row.sector}
                  onChange={(e) => updateLine(index, 'sector', e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label>
                <span>{lineLabels[5]}</span>
                <input
                  value={row.amount}
                  onChange={(e) => updateLine(index, 'amount', e.target.value)}
                  placeholder="e.g. 1500 or 1,500"
                  autoComplete="off"
                />
              </label>
            </div>
          </fieldset>
        ))}
      </section>

      {errors.length > 0 && (
        <div className="alert error" role="alert">
          <strong>Please fix the following:</strong>
          <ul>
            {errors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {fetchError && (
        <div className="alert error" role="alert">
          {fetchError}
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={handleGenerate}
          disabled={busy}
        >
          {busy ? 'Generating…' : 'Generate & download PDF'}
        </button>
      </div>
    </div>
  )
}
