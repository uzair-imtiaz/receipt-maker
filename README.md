# Receipt generator (web)

Vite + React + TypeScript app that fills receipt PDF templates using [pdf-lib](https://pdf-lib.js.org/), matching the layout and serial behavior of the original Python `receiptMaker.py`.

## Run locally

```bash
cd web
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Template PDFs (required)

Copy these files into `public/`:

- `public/template.pdf` — KMC template  
- `public/ticket_zone_template.pdf` — Ticket Zone template  

Without them, **Generate** will fail with a fetch error.

## Invoice / serial number

The next serial is stored in the browser as `localStorage` key `receiptSerial` (same lifecycle as `inv_id.txt`: use current value on the PDF and filename, then increment by 1 after a successful download).

For a shared or multi-user serial, move persistence to a server (for example a Next.js Route Handler) and keep the same pdf-lib drawing logic.

## Font (optional)

The Python script uses Tahoma at 9pt. To use Tahoma here, add a licensed copy as:

`public/fonts/Tahoma.ttf`

If that file is missing, the app uses **Helvetica** at 9pt instead (no extra license, slightly different metrics).

Custom TTF embedding uses **`@pdf-lib/fontkit`** (registered on the document before `embedFont`), which is required by pdf-lib for non-standard fonts.

## Build

```bash
npm run build
npm run preview   # optional: serve dist/
```
