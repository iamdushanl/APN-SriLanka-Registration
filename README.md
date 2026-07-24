# Aviation Professionals Network of Sri Lanka — Registration Portal

> **"Connecting Sri Lanka's Aviation Excellence"**

A production-ready web application for registering aviation professionals in Sri Lanka, built entirely within Google's ecosystem — zero external dependencies.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML5 · CSS3 (Flexbox/Grid) · ES6+ JavaScript |
| **Backend** | Google Apps Script (V8 runtime) |
| **Database** | Google Sheets (`Registry` sheet) |
| **Email** | Google MailApp / GmailApp |
| **Auth** | Script Properties (admin password) |

---

## 📁 Project Structure

```
Aviation_database/
├── Code.gs              # Google Apps Script backend
├── Index.html           # Frontend: registration form + admin dashboard
├── EmailTemplate.html   # HTML confirmation email template (inline CSS)
├── .gitignore
└── README.md
```

---

## ✨ Features

### Registration Form
- **3-step wizard** — Personal Details → Employment → Licensing & Submit
- **15 fields** with full client-side and server-side validation
- Real-time blur validation, shake animations on errors
- Conditional fields: Base Airport (required for operational roles), License Type (required if CAASL No. provided)
- Phone auto-normalisation to `+94` prefix
- Review & Confirm card before final submit
- Animated SVG checkmark success screen with copyable registration number

### Backend (Code.gs)
- `doGet(e)` — serves the HTML app
- `processFormSubmission(payload)` — validates, deduplicates, writes to sheet, emails
- `verifyAdminPassword(password)` — password gate for dashboard
- `getAdminData(password)` — returns registry rows for dashboard
- Registration numbers: `SL-AERO-YYYY-XXXX` (auto-increments, resets each year)
- Duplicate detection: email (Column E) + CAASL License No. (Column N)
- Rate limiting: max 3 submissions/hour per user (stored in `RateLimit` sheet)
- HTML sanitisation on all inputs

### Admin Dashboard (`?view=admin`)
- Password-gated with shake animation on wrong entry
- Stats cards: Total Registrations, This Month, Email Failures, Unique Categories
- Sortable, filterable, searchable data table (25 rows/page)
- Export: Filtered CSV / Full CSV
- Failed email rows highlighted in red

### Email Confirmation
- Professional HTML email with inline CSS (Gmail/Outlook/Apple Mail compatible)
- Navy header, registration number badge, submitted details table
- GAS scriptlet templating (`<?= variable ?>`)

---

## 🚀 Deployment Guide

### 1. Create Google Apps Script project
1. Go to [script.google.com](https://script.google.com) → **New project**
2. Paste `Code.gs` into the default script tab
3. **File → New → HTML file** → name it `Index` → paste `Index.html`
4. **File → New → HTML file** → name it `EmailTemplate` → paste `EmailTemplate.html`
5. Attach a Google Spreadsheet: **Resources → Cloud Platform project** or let the script auto-create sheets

### 2. Set admin password (run once)
In the script editor, select `setupScriptProperties` from the function dropdown and click **▶ Run**.  
Default password: `AviationAdmin@2026` — **change this before going live**.

### 3. Deploy as Web App
- **Deploy → New deployment → Web App**
- Execute as: **Me**
- Who has access: **Anyone**
- Copy the deployment URL

### 4. Access admin dashboard
Navigate to `<YOUR_URL>?view=admin`

---

## 📊 Google Sheets Schema

Sheet name: `Registry`

| Col | Header | Notes |
|---|---|---|
| A | Timestamp | Auto |
| B | Registration Number | `SL-AERO-YYYY-XXXX` |
| C | Full Name | |
| D | Preferred Name | |
| E | Primary Email | **Unique** |
| F | Primary Contact No. | Normalised to `+94…` |
| G | Secondary Contact No. | |
| H | Permanent Address | |
| I | Current Employer | |
| J | Job Category | |
| K | Job Title | |
| L | Primary Base Airport | |
| M | Employment Status | |
| N | CAASL License No. | **Unique if provided** |
| O | License Type | |
| P | Type Ratings | |
| Q | Total Experience / Hours | |
| R | Email Sent Status | `SENT` / `FAILED` / `PENDING` |

---

## ⚙️ Script Properties

| Key | Value | Set by |
|---|---|---|
| `ADMIN_PASSWORD` | Your secure password | `setupScriptProperties()` |

---

## 📋 Deployment Checklist

- [ ] Web app deployed — Execute as: Me, Access: Anyone
- [ ] `Registry` sheet has headers in Row 1
- [ ] `setupScriptProperties()` run with a secure password
- [ ] Test: 1 valid submission → confirm email received
- [ ] Test: duplicate email → error toast shown
- [ ] Test: duplicate CAASL → error toast shown
- [ ] Mobile verified at 375px and 768px

---

## 📄 License

© 2026 Aviation Professionals Network of Sri Lanka. All rights reserved.
