# StockFlow — Inventory & Sales Management

A full-stack inventory and point-of-sale system for small retail businesses: product catalog with stock tracking, customers, sales with printable invoices, dashboards, reports, and role-based staff accounts. Amounts are in Kenyan shillings with VAT-inclusive pricing.

**Stack:** React 18 + TypeScript + Vite + shadcn/ui + TanStack Query (frontend) · Node + Express 5 + SQLite via better-sqlite3 + zod (backend, in `server/`).

## Quick start

Requires Node 20.12+. Settings can go in a `.env` file at the repo root (see `.env.example`).

```sh
npm run setup   # installs both packages and seeds demo data
npm run dev     # API on :3001, web app on http://localhost:8080
```

Demo accounts (created by the seed):

| Role    | Email                     | Password      |
|---------|---------------------------|---------------|
| Admin   | admin@stockflow.local     | admin1234     |
| Cashier | cashier@stockflow.local   | cashier1234   |

`npm run seed` wipes and re-creates the database at any time. On an empty database the server creates a single admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults: `admin@stockflow.local` / `admin1234`) — change that password after first sign-in.

## Features

- **Products** — create/edit, SKU uniqueness, cost & margin, reorder levels with derived *in stock / low / out* status, stock adjustments (restock, count corrections) with a full movement history. Products with sales history are archived rather than deleted.
- **Barcode scanning** — products have an optional unique barcode (EAN/UPC); the New Sale dialog opens with a scan box focused, so any USB or Bluetooth scanner (which types the code and presses Enter) adds items instantly, one unit per scan. Codes match a barcode first, then the SKU, so unlabelled items can be scanned from a shelf label. On phones with a built-in barcode detector (Chrome on Android) a camera button scans with the phone camera. Barcodes can be scanned straight into the product form.
- **Sales (POS)** — searchable cart, live stock checks, walk-in or named customer (add one inline), Cash / M-Pesa / Card / Bank Transfer, paid or pending (credit), discounts, VAT shown as included. Recording a sale deducts stock atomically; cancelling one (admin) restores it. Printable invoices, CSV export, date/status filters, optional large-transaction review flag.
- **Suppliers & purchasing** (admin) — supplier directory with each product's preferred supplier; purchase orders that go draft → ordered → partly received → received (or cancelled); receiving goods raises stock, logs a restock movement against the PO, and updates unit cost as a weighted average. Reorder suggestions group low-stock items by supplier (net of quantities already on order) and turn into a draft PO in one click. Printable POs, overdue-delivery tracking.
- **Credit & payments** — sell on credit to a named customer with an optional deposit; record instalments by Cash, M-Pesa (with transaction code), Card or Bank Transfer until the invoice flips to paid. Per-customer credit limits (admin-set) are enforced at checkout. Every payment is kept in a ledger shown on the invoice and the customer's statement; Reports shows who owes what, aged 0–30 / 31–60 / 61–90 / 90+ days.
- **Returns & refunds** (admin) — return some or all items from a sale, valued at the discounted price actually paid. Each item goes back to stock or is written off as damaged. A return first reduces anything still owed on the sale; only overpayment is refunded (Cash, M-Pesa with code, Card or Bank Transfer). Reports net returns out of revenue, profit and product/category figures in the period they happen. Sales with returns can't be cancelled.
- **Expenses & profit and loss** (admin) — record running costs (rent, wages, utilities, transport, M-Pesa charges, custom categories) with payee, method and reference; filter by period and category, see spend by category, export CSV. Reports show a full P&L: revenue after returns − cost of goods = gross profit − expenses by category = net profit and net margin (also in the CSV export).
- **Customers** — contact details, active/inactive, lifetime orders and spend, purchase history.
- **Dashboard** — month-to-date revenue vs the same span last month, today's sales, pending payments, 7-day revenue chart, recent sales, low-stock watchlist.
- **Reports** (admin) — any date range: revenue, orders, average order, gross profit and margin (using cost captured at sale time), collected vs outstanding, daily trend, revenue by category and payment method, top products and customers, inventory value. CSV export.
- **Settings** — business details for invoices, VAT rate, alert preferences, staff accounts (admin), change own password.
- **Header** — global search across products, customers and invoices; low-stock alert bell.

### Roles

| Capability                                   | Cashier | Admin |
|----------------------------------------------|:-------:|:-----:|
| Record sales and credit payments             | ✓ | ✓ |
| View products, add/edit customers            | ✓ | ✓ |
| Manage products & stock, delete customers    |   | ✓ |
| Cancel sales, process returns, view reports, change settings |   | ✓ |
| Set customer credit limits                   |   | ✓ |
| Suppliers, purchase orders and expenses      |   | ✓ |
| Manage staff accounts                        |   | ✓ |

Permissions are enforced by the API; the UI simply hides what a role can't use.

## Scripts (repo root)

| Command            | What it does                                              |
|--------------------|-----------------------------------------------------------|
| `npm run dev`      | API (watch mode) + Vite dev server together               |
| `npm run seed`     | Reset the database with demo data                         |
| `npm test`         | API test suite (vitest + supertest, in-memory SQLite)     |
| `npm run typecheck`| Type-check frontend and server                            |
| `npm run build`    | Build the frontend into `dist/`                           |
| `npm start`        | Production server: API + built frontend on one port       |

## Production

```sh
npm run build
JWT_SECRET=$(openssl rand -hex 32) PORT=3001 npm start
```

The server serves `dist/` and the API from the same origin. Or with Docker:

```sh
docker build -t stockflow .
docker run -p 3001:3001 -e JWT_SECRET=change-me -v stockflow-data:/app/server/data stockflow
```

Environment variables (see `.env.example`):

| Variable          | Default                         | Notes                                   |
|-------------------|---------------------------------|-----------------------------------------|
| `JWT_SECRET`      | dev-only value                  | **Required** when `NODE_ENV=production` |
| `PORT`            | `3001`                          |                                         |
| `DB_PATH`         | `server/data/stockflow.db`      | SQLite file; back this up               |
| `ADMIN_EMAIL`     | `admin@stockflow.local`         | First-boot admin only                   |
| `ADMIN_PASSWORD`  | `admin1234`                     | First-boot admin only                   |
| `CORS_ORIGIN`     | unset (same-origin only)        | Comma-separated, if the UI is hosted elsewhere |

Dates in reports use the server's local timezone — set `TZ` (e.g. `TZ=Africa/Nairobi`) on the host or container.

## API overview

All routes are under `/api` and require `Authorization: Bearer <token>` except login and health.

```
POST   /auth/login                 GET  /auth/me           POST /auth/password
GET    /products[?search&status&category]   POST /products  PATCH/DELETE /products/:id
GET    /products/:id (with movements)       POST /products/:id/stock     GET /products/categories
GET    /products/lookup?code=  (barcode, then SKU)
GET    /customers[?search&status]  POST /customers         GET/PATCH/DELETE /customers/:id
GET    /sales[?search&status&from&to]       POST /sales     GET /sales/:id
PATCH  /sales/:id/status {paid|cancelled}   GET  /sales/export.csv
POST   /sales/:id/payments {amount, method, reference}
POST   /sales/:id/returns {items: [{saleItemId, quantity, restock}], reason, refundMethod?, refundReference}   (admin)
GET    /returns[?search&from&to]
GET/POST /expenses[?from&to&category&search]   PATCH/DELETE /expenses/:id   GET /expenses/categories   GET /expenses/export.csv   (admin)
GET    /reports/receivables (admin)        GET /customers?withBalance=true
GET    /dashboard                  GET  /reports[?from&to] GET  /reports/export.csv
GET    /settings                   PUT  /settings          GET  /search?q=
GET/POST /suppliers                GET/PATCH/DELETE /suppliers/:id                      (admin)
GET    /purchase-orders[?status=open|draft|...&supplierId&search]   POST /purchase-orders (admin)
GET    /purchase-orders/suggestions                 GET/PATCH/DELETE /purchase-orders/:id
POST   /purchase-orders/:id/order    POST /purchase-orders/:id/receive    POST /purchase-orders/:id/cancel
GET/POST /users                    PATCH /users/:id        (admin)
```

Money is stored as integer cents in SQLite and exposed as decimal shillings. Schema changes are applied automatically on startup, so existing databases upgrade in place.
