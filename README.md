# Receipt generator (web)

Vite + React + TypeScript app that fills receipt PDF templates using [pdf-lib](https://pdf-lib.js.org/), matching the layout of the original Python `receiptMaker.py` (invoice id is a random 6-digit number instead of a stored counter).

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

## Invoice ID

Each generated PDF gets a random **6-digit** invoice number (`100000`–`999999`) via `crypto.getRandomValues`, used both on the PDF and as the download filename (`{id}.pdf`). The Python script still uses a sequential counter in `inv_id.txt` if you need that behavior there.

For guaranteed unique ids across users or devices, assign ids on a server (for example a Next.js Route Handler) and pass them into the same pdf-lib drawing logic.

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
