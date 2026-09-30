# DocuFlow AI — Intelligent Document Processing Platform

> Turn unstructured documents into structured, validated, searchable and actionable information.

DocuFlow AI ingests PDF, JPG and PNG documents, reads them with OCR/vision, classifies them with AI,
extracts structured fields with per-field confidence scores, runs a validation engine over the numbers,
routes anything uncertain to a human reviewer, and then lets you chat with the document and export the
results.

```
USER → UPLOAD → OCR / VISION → CLASSIFICATION → DATA EXTRACTION → VALIDATION ENGINE
     → VERIFIED / ERROR DETECTED → HUMAN REVIEW (if required) → DATABASE
     → DASHBOARD / AI CHAT / EXPORT
```

---

## Table of contents

1. [Problem statement](#problem-statement)
2. [Solution](#solution)
3. [Features](#features)
4. [Architecture](#architecture)
5. [Tech stack](#tech-stack)
6. [Folder structure](#folder-structure)
7. [Quick start](#quick-start)
8. [Environment variables](#environment-variables)
9. [Supabase setup](#supabase-setup)
10. [AI / OCR setup](#ai--ocr-setup)
11. [Running the application](#running-the-application)
12. [Demo mode](#demo-mode)
13. [Testing the complete workflow](#testing-the-complete-workflow)
14. [API documentation](#api-documentation)
15. [Deployment](#deployment)
16. [Pushing to GitHub](#pushing-to-github)
17. [Security](#security)
18. [Future improvements](#future-improvements)

---

## Problem statement

Businesses receive a constant stream of documents — invoices, receipts, résumés, contracts, bank
statements, certificates and application forms — almost all of it unstructured. Manually reading and
re-keying that data is slow, expensive and error-prone. Off-the-shelf OCR gives you a wall of text; it
does not tell you *what* the document is, whether the numbers add up, or whether a human should double
check it.

Teams end up with three unsolved problems:

- **No structure.** Text is not data. "Subtotal ₹5000 / GST ₹900 / Total ₹7500" is only useful if
  something actually checks that those three numbers are consistent.
- **No trust signal.** A field pulled from a scan is not automatically correct. Without a confidence
  score, downstream systems treat a guess as a fact.
- **No feedback loop.** When extraction is uncertain or a total does not reconcile, there is no clean
  place for a human to review the original alongside the extracted values and correct it.

## Solution

DocuFlow AI is a complete pipeline rather than an OCR wrapper:

1. **Ingest** — drag-and-drop upload with type, extension and size validation; files land in Supabase
   Storage and a row is created in PostgreSQL.
2. **Read** — a swappable OCR/vision layer extracts text and layout. A built-in pure-Node PDF text
   extractor means text-based PDFs work with **zero external APIs**.
3. **Classify** — AI assigns one of eight document types with a confidence score, stored on the row.
4. **Extract** — document-type-specific schemas force structured JSON. Every field carries its own
   confidence score.
5. **Validate** — a rule engine checks totals, dates, required fields, numeric sanity, duplicate
   invoice numbers and logical consistency. Wording is deliberately neutral
   ("Possible discrepancy detected") — the engine never accuses a document of fraud.
6. **Score & route** — low confidence, a failed rule or a missing required field sends the document to
   a human review screen with the original document, extracted data, confidence scores and validation
   warnings side by side.
7. **Use it** — dashboard, analytics, smart search, document comparison, grounded AI chat and
   JSON / CSV / PDF export.

---

## Features

| Area | What you get |
| --- | --- |
| **Upload** | Drag & drop, file-type/extension/size validation, live upload progress, error messages, retry |
| **OCR / Vision** | Pluggable provider (`mock`, `local-pdf`, `openai-vision`, `gemini-vision`, `google-vision`, `azure-vision`). Structured output: `{ text, pages, blocks }` |
| **Classification** | Invoice, Receipt, Resume, Contract, Bank Statement, Certificate, Application Form, Other — with confidence + alternatives |
| **Extraction** | Per-type schemas. Invoice, Receipt, Resume, Contract, Bank Statement, Certificate and Application Form all have dedicated field sets |
| **Confidence scores** | Every field scored 0–1. 90–100% high, 70–89% medium, below 70% needs review. Presented as indicative, never as a guarantee |
| **Validation engine** | Required fields, date validity, numeric values, subtotal + tax = total, GST consistency, statement reconciliation, contract term, duplicate invoice numbers, logical consistency |
| **Human review** | Queue, side-by-side original + data, edit / approve / reject fields, add missing fields, approve document or flag as needs attention, full audit trail |
| **Dashboard** | Totals, processed / needs-review / error counts, type distribution donut, status chart, recent documents |
| **Analytics** | Type distribution, absolute counts, status breakdown, average confidence by type |
| **Document details** | Split view: original preview + OCR text on the left; type, confidence, fields, validation, status on the right |
| **AI document chat** | Per-document chat grounded strictly in extracted fields + OCR text. Refuses to invent: *"I couldn't find that information in the document."* History persisted |
| **Document comparison** | Two documents of the same type → added / removed / changed values and changed clauses. Facts and AI interpretation are clearly separated |
| **Smart search** | Natural-language queries: "Show invoices above ₹50,000", "Find contracts expiring soon", "Show documents that need review" — plus free-text search across extracted values |
| **Export** | JSON (structured), CSV (tabular), PDF report (document info, classification, extracted data, validation, confidence, review status) |
| **Auth & tenancy** | Supabase Auth (or a labelled local fallback). Every route is protected; every query is scoped to the caller |
| **Demo mode** | Runs the full pipeline with no external credentials, clearly labelled in the UI |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  BROWSER  —  React + Vite (JavaScript)                                       │
│                                                                              │
│  Navbar · Sidebar · UploadBox · DocumentCard · ProcessingStatus              │
│  ExtractedDataTable · ValidationResult · ConfidenceBadge · ChatBox           │
│  ExportButtons · DocumentPreview                                             │
│                                                                              │
│  services/api.js  ──►  every call is relative (/api/...)                     │
│                       NO API KEYS EVER REACH THE BROWSER                     │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │  HTTP + Bearer token
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  BACKEND  —  Node.js + Express (MVC)                                         │
│                                                                              │
│  routes/        URL wiring only                                              │
│  controllers/   thin request/response shaping                                │
│  middleware/    authMiddleware · uploadMiddleware · errorMiddleware          │
│                                                                              │
│  services/      ← all business logic lives here                              │
│    ocrService.js            OCR abstraction (provider-swappable)             │
│    visionService.js         multimodal leg of the OCR layer                  │
│    aiClient.js              provider-swappable AI client                     │
│    classificationService.js document typing                                   │
│    extractionService.js     per-type schemas + confidence                     │
│    validationService.js     rule engine + status decision                     │
│    pipelineService.js       the 7-stage orchestrator                          │
│    chatService.js           grounded document Q&A                            │
│    exportService.js         JSON / CSV / PDF                                  │
│    comparisonService.js     document diffing                                   │
│    storageService.js        Supabase Storage or local disk                    │
│    database.js              Supabase PostgREST or local JSON store            │
│    authService.js           Supabase Auth or labelled demo auth               │
│                                                                              │
│  config/env.js  ·  utils/logger.js  ·  utils/validators.js                   │
│  utils/pdfText.js  ·  utils/pdfReport.js  ·  utils/errors.js  ·  utils/json.js│
└───────────┬───────────────────────────────┬──────────────────────────────────┘
            │                               │
            ▼                               ▼
┌───────────────────────────┐   ┌──────────────────────────────────────────────┐
│  Supabase PostgreSQL      │   │  Supabase Storage  (private bucket)           │
│  profiles                 │   │  documents/{user_id}/{uuid}.{ext}            │
│  documents                │   │                                              │
│  extracted_data           │   │  Every table has Row Level Security so a      │
│  validation_results       │   │  user can only read/write their own rows.     │
│  processing_logs          │   │                                              │
│  chat_messages            │   │                                              │
│  review_actions           │   │                                              │
└───────────────────────────┘   └──────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────┐
│  AI / OCR provider        │
│  (configured via .env)    │
│  mock · openai · anthropic│
│  gemini · openrouter      │
└───────────────────────────┘
```

### Processing pipeline with progress

| Stage | Progress | What happens |
| --- | --- | --- |
| Uploading | 10% | File stored, document row created |
| OCR Processing | 25% | Text + layout extracted |
| Classifying | 40% | Document type + confidence |
| Extracting Data | 60% | Structured fields + per-field confidence |
| Validating | 80% | Rule engine runs |
| Confidence Scoring | 95% | Status decided: verified / needs review / error |
| Completed | 100% | Persisted and ready to use |

---

## Tech stack

**Frontend** — React 18, Vite 5, JavaScript (JSX), React Router 6, modern CSS (no UI framework,
no chart library — charts are hand-rolled inline SVG).

**Backend** — Node.js 18+, Express 4, MVC architecture, async/await, multer for uploads.

**Database** — Supabase PostgreSQL (PostgREST) with Row Level Security.

**Storage** — Supabase Storage (private bucket) with a local-disk fallback.

**AI** — OpenAI, Anthropic, Google Gemini or OpenRouter, selected by `AI_PROVIDER`. A built-in
heuristic engine runs the whole pipeline offline.

**OCR / Vision** — `local-pdf` (pure-Node, zero dependencies), OpenAI Vision, Gemini Vision,
Google Cloud Vision, Azure AI Vision.

---

## Folder structure

```
Intelligent-Document-Processing/
├── docuflow-ai/
│   ├── frontend/
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Navbar.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── UploadBox.jsx
│   │   │   │   ├── DocumentCard.jsx
│   │   │   │   ├── ProcessingStatus.jsx
│   │   │   │   ├── ExtractedDataTable.jsx
│   │   │   │   ├── ValidationResult.jsx
│   │   │   │   ├── ConfidenceBadge.jsx
│   │   │   │   ├── ChatBox.jsx
│   │   │   │   ├── ExportButtons.jsx
│   │   │   │   ├── DocumentPreview.jsx
│   │   │   │   ├── StatusBadge.jsx
│   │   │   │   ├── Charts.jsx
│   │   │   │   ├── Modal.jsx
│   │   │   │   ├── Toast.jsx
│   │   │   │   └── States.jsx
│   │   │   ├── pages/
│   │   │   │   ├── Login.jsx
│   │   │   │   ├── Register.jsx
│   │   │   │   ├── Dashboard.jsx
│   │   │   │   ├── Documents.jsx
│   │   │   │   ├── DocumentDetails.jsx
│   │   │   │   ├── Review.jsx
│   │   │   │   ├── Analytics.jsx
│   │   │   │   └── Settings.jsx
│   │   │   ├── services/api.js
│   │   │   ├── hooks/useAuth.jsx
│   │   │   ├── utils/format.js
│   │   │   ├── styles/global.css
│   │   │   ├── App.jsx
│   │   │   └── main.jsx
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── vercel.json
│   │   └── .env.example
│   │
│   ├── backend/
│   │   ├── controllers/
│   │   │   ├── documentController.js
│   │   │   ├── processingController.js
│   │   │   ├── chatController.js
│   │   │   ├── exportController.js
│   │   │   ├── reviewController.js
│   │   │   └── authController.js
│   │   ├── routes/
│   │   │   ├── documentRoutes.js
│   │   │   ├── processingRoutes.js
│   │   │   ├── chatRoutes.js
│   │   │   ├── exportRoutes.js
│   │   │   ├── reviewRoutes.js
│   │   │   └── authRoutes.js
│   │   ├── services/
│   │   │   ├── ocrService.js
│   │   │   ├── visionService.js
│   │   │   ├── aiClient.js
│   │   │   ├── classificationService.js
│   │   │   ├── extractionService.js
│   │   │   ├── validationService.js
│   │   │   ├── pipelineService.js
│   │   │   ├── chatService.js
│   │   │   ├── exportService.js
│   │   │   ├── comparisonService.js
│   │   │   ├── storageService.js
│   │   │   ├── database.js
│   │   │   ├── authService.js
│   │   │   └── demoCorpus.js
│   │   ├── middleware/
│   │   │   ├── authMiddleware.js
│   │   │   ├── uploadMiddleware.js
│   │   │   └── errorMiddleware.js
│   │   ├── config/
│   │   │   └── env.js
│   │   ├── utils/
│   │   │   ├── logger.js
│   │   │   ├── validators.js
│   │   │   ├── errors.js
│   │   │   ├── json.js
│   │   │   ├── pdfText.js
│   │   │   └── pdfReport.js
│   │   ├── scripts/seedDemoData.js
│   │   ├── server.js
│   │   ├── package.json
│   │   └── .env.example
│   │
│   ├── supabase/
│   │   ├── schema.sql
│   │   └── seed.sql
│   ├── render.yaml
│   └── .gitignore
└── README.md
```

---

## Quick start

### Prerequisites

- Node.js 18 or newer
- npm 9 or newer
- (Optional) a Supabase project and an AI / OCR API key

### 1. Install dependencies

```bash
# Backend
cd docuflow-ai/backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure the backend

```bash
cd docuflow-ai/backend
cp .env.example .env
```

Edit `.env`. The defaults work with **no external services** — the platform runs in demo mode. To
use production engines, fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`AI_PROVIDER`, `AI_API_KEY`, `OCR_PROVIDER` and `OCR_API_KEY`.

### 3. Configure the frontend (optional)

```bash
cd docuflow-ai/frontend
cp .env.example .env
```

The default `VITE_API_URL=/api` works because the Vite dev server proxies `/api` to
`http://localhost:5000`.

---

## Environment variables

### Backend (`docuflow-ai/backend/.env`)

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | no | `5000` | API port |
| `NODE_ENV` | no | `development` | `production` hides stack traces |
| `CORS_ORIGIN` | no | `http://localhost:5173` | Comma-separated allowed origins |
| `SUPABASE_URL` | for prod | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | for prod | — | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | for prod | — | **Backend only.** Bypasses RLS |
| `SUPABASE_STORAGE_BUCKET` | no | `documents` | Storage bucket name |
| `AI_PROVIDER` | no | `mock` | `mock` \| `openai` \| `anthropic` \| `gemini` \| `openrouter` |
| `AI_API_KEY` | for prod | — | AI provider key |
| `AI_MODEL` | no | provider default | e.g. `gpt-4o-mini`, `claude-3-5-sonnet-latest` |
| `AI_BASE_URL` | no | provider default | Override for proxies / Azure OpenAI |
| `AI_MAX_RETRIES` | no | `2` | Retries on 5xx / 429 |
| `AI_TIMEOUT_MS` | no | `45000` | Per-request timeout |
| `OCR_PROVIDER` | no | `mock` | `mock` \| `local-pdf` \| `openai-vision` \| `gemini-vision` \| `google-vision` \| `azure-vision` |
| `OCR_API_KEY` | for prod | — | OCR provider key |
| `OCR_BASE_URL` | no | — | Required for `azure-vision` |
| `MAX_FILE_SIZE_MB` | no | `15` | Upload limit |
| `ALLOWED_FILE_TYPES` | no | pdf/jpeg/png | Accepted MIME types |
| `DEMO_JWT_SECRET` | demo only | `change-me` | Signs demo-mode session tokens |
| `SESSION_TTL_SECONDS` | no | `604800` | Session lifetime |
| `LOG_LEVEL` | no | `info` | `error` \| `warn` \| `info` \| `debug` |
| `PIPELINE_STAGE_DELAY_MS` | no | `0` | Artificial per-stage delay — set to `600` to make the pipeline visible during a live demo |

### Frontend (`docuflow-ai/frontend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | Base URL for the API |
| `VITE_API_PROXY_TARGET` | `http://localhost:5000` | Dev-server proxy target |

> **Never commit a real `.env` file.** Both `.env` files are git-ignored.

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com) and note the project URL.
2. Open **SQL Editor → New query**, paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql) and run it. This creates:
   - the seven tables (`profiles`, `documents`, `extracted_data`, `validation_results`,
     `processing_logs`, `chat_messages`, `review_actions`)
   - indexes and foreign keys with `on delete cascade`
   - `updated_at` triggers
   - a trigger that creates a `profiles` row on sign-up
   - **Row Level Security policies on every table** — users only see their own records
   - a private `documents` storage bucket with per-user folder policies
3. Copy the values into `backend/.env`:
   - `SUPABASE_URL` — Project Settings → API → Project URL
   - `SUPABASE_ANON_KEY` — Project Settings → API → `anon` `public`
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → `service_role` `secret`
4. **Authentication** — Authentication → Providers. Email/password is enabled by default. For
   production, configure your Site URL and redirect URLs.
5. Restart the backend. The startup banner will show `Database: supabase` instead of `DEMO MODE`.

> The service-role key bypasses RLS, so it is only ever used server-side. The anon key is the only
> key that belongs in a browser, and DocuFlow AI keeps even that on the backend.

### Verifying RLS

Sign in as two different users and confirm neither can read the other's documents. Every document
endpoint scopes by `user_id`, so a cross-tenant request returns `404`.

---

## AI / OCR setup

### AI providers

Set `AI_PROVIDER` and `AI_API_KEY`:

| Provider | `AI_PROVIDER` | Default model |
| --- | --- | --- |
| OpenAI | `openai` | `gpt-4o-mini` |
| Anthropic | `anthropic` | `claude-3-5-sonnet-latest` |
| Google Gemini | `gemini` | `gemini-1.5-flash` |
| OpenRouter | `openrouter` | `openai/gpt-4o-mini` |
| Built-in (no key) | `mock` | heuristic engine |

### OCR providers

| Provider | `OCR_PROVIDER` | Notes |
| --- | --- | --- |
| Local PDF text | `local-pdf` | Pure Node, **no API key, no dependencies**. Reads text-based PDFs. Scanned PDFs report back that they need a vision provider. |
| OpenAI Vision | `openai-vision` | Uses `AI_API_KEY`; handles images and PDFs |
| Gemini Vision | `gemini-vision` | Uses `AI_API_KEY` |
| Google Cloud Vision | `google-vision` | Set `OCR_API_KEY` |
| Azure AI Vision | `azure-vision` | Set `OCR_API_KEY` and `OCR_BASE_URL` |
| Demo corpus | `mock` | Bundled representative documents; auto-falls back to `local-pdf` for real text-based PDFs |

**Recommended zero-cost combination:** `AI_PROVIDER=mock` + `OCR_PROVIDER=mock`. Real text-based
PDFs are still genuinely parsed by the local extractor, classification and extraction run on the
heuristic engine, and validation runs in full.

---

## Running the application

### Backend

```bash
cd docuflow-ai/backend
npm install
npm run dev      # node --watch, auto-restarts on change
# or
npm start        # production
```

You should see:

```
  ╔══════════════════════════════════════════════════════════╗
  ║            DocuFlow AI - Backend API                     ║
  ╠══════════════════════════════════════════════════════════╣
  ║  URL        : http://localhost:5000                      ║
  ║  Database   : supabase                                   ║
  ║  Storage    : supabase-storage                           ║
  ║  Auth       : supabase-auth                              ║
  ║  AI engine  : openai                                     ║
  ║  OCR engine : local-pdf                                  ║
  ╚══════════════════════════════════════════════════════════╝
```

### Frontend

```bash
cd docuflow-ai/frontend
npm install
npm run dev      # http://localhost:5173
```

### Production build

```bash
cd docuflow-ai/frontend
npm run build    # outputs to dist/
npm run preview  # serve the production build locally
```

### Demo credentials

```
Email:    demo@docuflow.ai
Password: demo1234
```

The demo account is created automatically on first boot in demo mode and seeded with six sample
documents (invoice, invoice with a deliberate discrepancy, résumé, contract, bank statement,
receipt). To re-seed manually:

```bash
cd docuflow-ai/backend
rm -rf data       # wipe the demo store
npm start         # seeds again on boot
# or
npm run seed
```

---

## Demo mode

When Supabase credentials or AI/OCR keys are missing, DocuFlow AI does **not** break — it degrades
to clearly-labelled fallbacks:

| Concern | Fallback | How it is labelled |
| --- | --- | --- |
| Database | Local JSON file store | Sidebar card + orange banner + Settings page |
| Storage | Local disk under `backend/data/uploads` | Settings page |
| Auth | Local accounts with scrypt hashing + HMAC tokens | Settings page |
| AI | Heuristic classification / extraction / chat | Settings page |
| OCR | Bundled demo corpus (real PDFs still use the local extractor) | Banner on the document page |

The banner at the top of every authenticated page reads **DEMO MODE** and lists exactly which
engines are fallbacks. There is no silent faking.

---

## Testing the complete workflow

### The 8-step hackathon demo

1. **Sign in** at `http://localhost:5173/login` with the demo credentials.
2. **Upload** — go to **Upload**, drag in `invoice.pdf` (or any text-based PDF). Watch the pipeline
   advance: Uploading 10% → OCR 25% → Classifying 40% → Extracting 60% → Validating 80% → Completed 100%.
3. **Classification** — open the document. Document type: **Invoice**, confidence **98%**.
4. **Extracted data** — Invoice Number `INV-1023`, Customer `Rahul Kumar`, Date `30/09/2026`,
   Subtotal `₹5,000.00`, GST `₹900.00`, Total `₹5,900.00`, each with its own confidence score.
5. **Validation** — *Subtotal + tax = 5900, which matches the stated total.* → **Verified ✅**
6. **AI chat** — open the **AI chat** tab and ask:
   - "What is the total amount?" → *"The total is ₹5,900.00."*
   - "Who is the customer?" → *"The customer is Rahul Kumar."*
   - "What is the GST amount?" → *"The GST is ₹900.00."*
   - "Who is the CEO of Google?" → *"I couldn't find that information in the document."*
7. **Export** — **Export JSON**, **Export CSV**, **Generate PDF Report**.
8. **Discrepancy + review** — open `invoice_discrepancy.pdf`:
   - Subtotal ₹5,000, GST ₹900, but Total ₹7,500
   - Validation: *"Possible discrepancy detected. Subtotal + tax = 5900 but the document states 7500
     (difference of 1600)."*
   - Status: **Needs Review** → **Review** → correct the total → **Approve document** → **Verified**

### Command-line smoke test

```bash
# 1. Sign in and capture a token
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@docuflow.ai","password":"demo1234"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['session']['access_token'])")

# 2. List documents
curl -s http://localhost:5000/api/documents -H "Authorization: Bearer $TOKEN"

# 3. Upload a document (starts the pipeline)
curl -s -X POST http://localhost:5000/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" -F "file=@/path/to/invoice.pdf"

# 4. Poll status
curl -s http://localhost:5000/api/documents/<id>/status -H "Authorization: Bearer $TOKEN"

# 5. Read extracted data, validation, chat, exports
curl -s http://localhost:5000/api/documents/<id>/extracted-data -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:5000/api/documents/<id>/validation     -H "Authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:5000/api/documents/<id>/chat \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"question":"What is the total amount?"}'
curl -s http://localhost:5000/api/documents/<id>/export/json -H "Authorization: Bearer $TOKEN"

# 6. Smart search
curl -s "http://localhost:5000/api/documents/search?q=Show%20invoices%20above%2050000" \
  -H "Authorization: Bearer $TOKEN"
```

### Making the pipeline visible on stage

Set `PIPELINE_STAGE_DELAY_MS=600` in `backend/.env` and restart. Each stage now takes ~600 ms, so
the progress bar and stage list are easy to follow on a projector.

---

## API documentation

Base URL: `http://localhost:5000/api`
Auth header for every protected route: `Authorization: Bearer <access_token>`

### Health & capabilities

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | — | Liveness probe |
| GET | `/capabilities` | — | Which engines are live and whether demo mode is active |

### Authentication

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/auth/register` | Create an account. Body: `{ email, password, fullName }` |
| POST | `/auth/login` | Sign in. Body: `{ email, password }` |
| GET | `/auth/me` | Current user |
| POST | `/auth/logout` | Discard the session |

### Documents

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/documents/upload` | Multipart upload (`file`). Stores the file, creates the row, starts the pipeline |
| GET | `/documents` | List. Query: `status`, `type`, `search`, `limit` |
| GET | `/documents/stats` | Dashboard aggregates |
| GET | `/documents/search?q=` | Natural-language + free-text search |
| POST | `/documents/compare` | Compare two documents. Body: `{ documentIdA, documentIdB }` |
| GET | `/documents/config` | Upload policy + storage info |
| GET | `/documents/file/:path` | Stream the stored document for preview |
| GET | `/documents/:id` | Full detail: document, fields, validation, logs, pipeline, schema |
| DELETE | `/documents/:id` | Delete the document and its file |

### Processing

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/documents/:id/process` | Re-run the pipeline synchronously |
| GET | `/documents/:id/status` | Lightweight polling endpoint |
| GET | `/documents/:id/logs` | Processing log |
| GET | `/documents/:id/extracted-data` | Fields with confidence |
| GET | `/documents/:id/validation` | Validation results + summary |

### Review

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/review/queue` | Documents awaiting a human decision |
| POST | `/documents/:id/review` | Submit a review action |
| GET | `/documents/:id/review` | Review history for a document |

Review action body:

```json
{ "action": "edit_field", "field": "total", "value": 5900, "comment": "Confirmed with vendor" }
```

`action` is one of `approve_field`, `reject_field`, `edit_field`, `add_field`, `approve_document`,
`needs_attention`.

### Chat

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/documents/:id/chat` | Ask a question. Body: `{ question }` |
| GET | `/documents/:id/chat` | Chat history + suggested questions |

### Export

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/documents/:id/export/json` | Structured JSON payload |
| GET | `/documents/:id/export/csv` | Tabular CSV |
| GET | `/documents/:id/export/pdf` | Formatted PDF report |
| GET | `/documents/:id/report` | JSON payload for the on-screen report |

### Response shapes

Upload:

```json
{
  "document": { "id": "...", "fileName": "invoice.pdf", "status": "processing", "progress": 5 },
  "pipeline": [{ "key": "ocr", "label": "OCR Processing", "progress": 25 }],
  "message": "Document uploaded. Processing has started."
}
```

Document detail:

```json
{
  "document": {
    "id": "...", "fileName": "invoice.pdf", "documentType": "invoice",
    "classificationConfidence": 0.98, "status": "verified", "progress": 100,
    "currentStage": "complete", "missingFields": [], "ocrText": "..."
  },
  "fields": {
    "invoice_number": { "value": "INV-1023", "confidence": 0.96 },
    "subtotal":       { "value": 5000,      "confidence": 0.96, "unit": "currency" }
  },
  "validationResults": [
    { "rule_name": "total_calculation", "status": "pass", "message": "Subtotal + tax = 5900..." }
  ],
  "processingLogs": [{ "stage": "ocr", "status": "completed", "progress": 25 }],
  "pipeline": [],
  "schema": {}
}
```

Chat:

```json
{ "message": { "question": "What is the total?", "answer": "The total is ₹5,900.00.", "grounded": true } }
```

### Error format

Every error is normalised — raw upstream errors and stack traces are never exposed in production:

```json
{ "error": { "code": "validation_error", "message": "File is too large. Maximum allowed size is 15 MB." } }
```

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 400 | `validation_error` | Invalid input or upload |
| 401 | `authentication_error` | Missing / expired token |
| 403 | `forbidden` | Not your resource |
| 404 | `not_found` | No such document |
| 409 | `conflict` | Duplicate email, or already processing |
| 422 | `ocr_empty` | No text could be extracted |
| 502 | `upstream_error` | AI / OCR / Supabase failure |
| 503 | `network_error` | Network failure |
| 504 | `upstream_timeout` | Provider timed out |

---

## Deployment

### Backend → Render

**Option A — Blueprint (recommended)**

1. Push the repository to GitHub.
2. In Render: **New + → Blueprint** and pick this repository. `render.yaml` is detected automatically.
3. Set the `sync: false` variables in the dashboard (Supabase keys, AI key, `CORS_ORIGIN`).
4. Deploy. The health check hits `/api/health`.

**Option B — Manual Web Service**

| Setting | Value |
| --- | --- |
| Root directory | `docuflow-ai/backend` |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Node version | 18 or newer |

Then add the environment variables from `backend/.env.example`. Set `CORS_ORIGIN` to your frontend
URL, e.g. `https://docuflow-ai.vercel.app`.

> Render's free tier uses an ephemeral filesystem, so `backend/data` is wiped on redeploy. Configure
> Supabase for persistent storage in production.

### Frontend → Vercel / Netlify

```bash
cd docuflow-ai/frontend
npm run build
```

Deploy the `dist/` directory.

**Vercel**

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | `docuflow-ai/frontend` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variable | `VITE_API_URL=https://your-backend.onrender.com/api` |

`vercel.json` is included and handles SPA routing.

**Netlify**

| Setting | Value |
| --- | --- |
| Base directory | `docuflow-ai/frontend` |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Environment variable | `VITE_API_URL=https://your-backend.onrender.com/api` |

Add a `_redirects` file (or `netlify.toml`) with `/* /index.html 200` so client-side routing works.

### Deployment checklist

- [ ] `supabase/schema.sql` has been run in the Supabase SQL editor
- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are set on the backend
- [ ] `CORS_ORIGIN` on the backend matches the deployed frontend URL exactly
- [ ] `VITE_API_URL` on the frontend points at the deployed backend
- [ ] `NODE_ENV=production` on the backend (hides stack traces)
- [ ] `DEMO_JWT_SECRET` is set to a long random value
- [ ] No `.env` file is committed

---

## Pushing to GitHub

```bash
# From the repository root
git checkout -b arena/01a0f0c4-intelligent-document-processin   # your working branch

git add .
git status                 # confirm no .env or node_modules are staged
git commit -m "feat: DocuFlow AI - intelligent document processing platform"

git push -u origin arena/01a0f0c4-intelligent-document-processin
```

Open a pull request from `arena/01a0f0c4-intelligent-document-processin` to `main`:

```bash
gh pr create --base main \
  --head arena/01a0f0c4-intelligent-document-processin \
  --title "DocuFlow AI - Intelligent Document Processing Platform" \
  --body "OCR, AI classification, structured extraction, validation, human review, chat, search, comparison and export."
```

### What is safe to commit

`.gitignore` already excludes `node_modules/`, `dist/`, `.env`, `backend/data/` and logs. Before your
first commit, double-check:

```bash
git status --short
git ls-files | grep -E '\.env$|node_modules' && echo "PROBLEM: secrets staged" || echo "clean"
```

---

## Security

- **No keys in the browser.** The frontend only ever calls `/api/...`. Every provider key lives in
  the backend environment.
- **Authentication on every route.** `requireAuth` resolves the bearer token before a controller runs.
- **Row Level Security.** Every Supabase table has policies scoping access to `auth.uid()`. The
  backend additionally scopes every query by `user_id`, so a cross-tenant request returns `404`.
- **Upload validation.** MIME type, extension and size are checked in multer *and* re-validated in
  the controller before anything is stored.
- **Private storage.** The `documents` bucket is not public; objects are addressed per user folder and
  served through short-lived signed URLs or the authenticated proxy route.
- **Input sanitisation.** Control characters are stripped, HTML is escaped, and all user input is
  length-capped before it reaches a service.
- **No sensitive data in logs.** The logger records metadata only — ids, file names, stages,
  timings, error messages. Never document contents, never credentials.
- **Safe error surface.** The error middleware maps upstream failures to friendly messages and strips
  stack traces in production.
- **Grounding in chat.** Answers are built only from the document's extracted fields and OCR text;
  when information is absent the assistant says so instead of guessing.
- **Neutral validation language.** The engine reports "Possible discrepancy detected" — it never
  labels a document as fraudulent.

---

## Future improvements

- **Batch processing** — upload a folder and process documents concurrently with a queue.
- **Webhooks & API keys** — let downstream systems receive results or trigger processing.
- **Multi-page OCR** — rasterise PDF pages so scanned documents get true vision OCR without a
  third-party key.
- **Custom document types** — let users define their own extraction schemas in the UI.
- **Confidence tuning** — track reviewer corrections and use them to calibrate thresholds per type.
- **Table & signature detection** — structured line-item tables and signature/region detection.
- **Full-text search** — move search into PostgreSQL `tsvector` for large workspaces.
- **Audit log export** — a compliance-ready trail of every read, edit and approval.
- **Team workspaces** — shared documents with role-based access control.
- **Internationalisation** — multi-language OCR and extraction prompts.

---

## License

MIT — built for hackathons and production alike.
