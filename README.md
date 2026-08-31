# Mal3bk (ملعبك) — Sports Court Booking & Venue Management Platform

Mal3bk is a full-stack sports venue booking and tournament management platform built for court operators, managers, and sports players across Egypt.

---

## 🚀 Features

- **🏟️ Court Booking & Availability:** Real-time scheduling with 24-hour and custom operating window support, overnight booking logic, and instant availability validation.
- **💳 Paymob Unified Payment Integration:**
  - **Intention API:** Seamless payment creation using Paymob Egypt's modern Intention API (`POST /v1/intention/`).
  - **Unified Hosted Checkout:** Redirection to Paymob's Unified Checkout (`accept.paymob.com/unifiedcheckout/`) supporting cards, mobile wallets, and Apple Pay.
  - **Flexible Deposit Policies:** Configure court-level payment requirements (**Full Payment**, **Percentage Deposit**, or **Fixed EGP Deposit**) with remaining balance collected at the venue.
  - **HMAC SHA-512 Webhooks:** Cryptographically verified callback processing using 20 canonical fields, timing-safe equality checks, and idempotent database transitions.
  - **5-Minute Reservation Holds:** Automated concurrency lock and hold cleaner sweeping expired checkouts to prevent double bookings and calendar lockups.
- **📱 Player Dashboard:** Court browsing, favorites, interactive booking modals, check-in QR/alphanumeric code generation, and payment status tracking.
- **👑 Manager & Admin Portals:** Venue and court management, pricing and peak-hour configuration, deposit policy controls, tournament management, revenue analytics, and attendee check-in scanners.
- **🏆 Tournaments Module:** Automated tournament registration windows, team enrollment, bracket scheduling, and match results.

---

## 🛠️ Tech Stack

### Frontend (`frontend/mal3abk-frontend`)
- **Framework:** Next.js 16 (App Router, Turbopack)
- **UI Library:** React 19, TailwindCSS, Radix UI / Shadcn UI
- **Icons:** Lucide React
- **Internationalization:** Arabic (RTL) & English (LTR)

### Backend (`backend/mal3abi-backend`)
- **Runtime:** Node.js (ES Modules)
- **Server:** Express.js 5
- **ORM & Database:** Prisma ORM, PostgreSQL
- **Security:** JWT Authentication, CSRF protection, timing-safe HMAC SHA-512 validation, Rate Limiting
- **Testing:** Jest, Supertest

---

## 📂 Project Structure

```
├── backend/mal3abi-backend/        # Express.js REST API
│   ├── prisma/                    # Prisma schema and migrations
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/              # Authentication & user sessions
│   │   │   ├── bookings/          # Availability, pricing & hold cleaner
│   │   │   ├── courts/            # Court management & closures
│   │   │   ├── payments/          # Paymob Intention, webhooks & inquiry
│   │   │   ├── tournaments/       # Tournament registration & brackets
│   │   │   └── users/             # User profiles & RBAC
│   │   ├── server.js              # Server boot & background workers
│   │   └── app.js                 # Express application & middleware
│   └── tests/                     # Jest unit & integration test suites
│
├── frontend/mal3abk-frontend/      # Next.js 16 Web Application
│   ├── app/                       # App Router routes & layouts
│   │   ├── dashboard/             # Admin, Manager, Player dashboards
│   │   ├── payment/complete/      # Paymob return & check-in code page
│   │   └── auth/                  # Login, register, password reset
│   ├── components/                # Reusable UI components & modals
│   └── lib/                       # API clients, helpers & utilities
└── README.md
```

---

## ⚡ Getting Started

### Prerequisites
- Node.js `>= 20.x`
- PostgreSQL database
- Paymob Egypt Merchant Account (Test / Live credentials)

### 1. Backend Setup

```bash
cd backend/mal3abi-backend
npm install

# Configure environment variables
cp .env.example .env

# Generate Prisma Client & apply migrations
npx prisma generate
npx prisma migrate dev

# Start development server (Port 4000)
npm run dev
```

#### Backend Environment Variables (`.env`)
```env
PORT=4000
DATABASE_URL="postgresql://user:password@localhost:5432/mal3abk?schema=public"
JWT_ACCESS_SECRET="your_jwt_access_secret"
JWT_REFRESH_SECRET="your_jwt_refresh_secret"

# Paymob Egypt Credentials
PAYMOB_BASE_URL="https://accept.paymob.com"
PAYMOB_API_KEY="your_paymob_api_key"
PAYMOB_PUBLIC_KEY="egy_pk_test_..."
PAYMOB_SECRET_KEY="egy_sk_test_..."
PAYMOB_HMAC_SECRET="your_paymob_hmac_secret"
PAYMOB_INTEGRATION_ID_CARD="5835543"
PAYMOB_INTEGRATION_ID_WALLET="5835572"
```

### 2. Frontend Setup

```bash
cd frontend/mal3abk-frontend
npm install

# Start Next.js development server (Port 3000)
npm run dev
```

#### Frontend Environment Variables (`.env.local`)
```env
NEXT_PUBLIC_API_URL="http://localhost:4000/api/v1"
```

---

## 🧪 Testing

The backend includes a comprehensive automated test suite (32 test suites, 326 tests):

```bash
cd backend/mal3abi-backend

# Run all test suites
npm test

# Run Paymob unit tests
npm test -- tests/unit/paymob.service.test.js

# Run Payments & Webhooks integration tests
npm test -- tests/integration/payments.test.js
```

---

## 🔒 Security & Payment Specification

- **Intention API Only:** Deprecated 3-step payment key flows are strictly omitted in favor of `POST /v1/intention/`.
- **HMAC Signature:** SHA-512 lowercase hex validation over the 20 canonical fields with constant-time equality check (`crypto.timingSafeEqual`).
- **Webhook Source of Truth:** Payments and bookings are confirmed only upon verified POST callbacks. Redirection URLs are treated purely for UX navigation.
- **Idempotency:** Unique indexing on `paymobTransactionId` prevents duplicate order processing.
- **Multi-Tenant Protection:** Enforces strict caller authorization (IDOR protection on booking queries and court-manager ownership checks on refund issuance).

---

## 📄 License

Proprietary — All rights reserved © 2026 Mal3bk Team.
