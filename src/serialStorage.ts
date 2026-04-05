const STORAGE_KEY = 'receiptSerial'

/** Same semantics as inv_id.txt: missing or invalid → 0 */
export function readSerial(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null || raw.trim() === '') return 0
    const n = parseInt(raw.trim(), 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

export function writeSerial(serial: number): void {
  localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.floor(serial))))
}
