# GoToCare Client & Family Portal

A mobile-first portal for home care clients and their families to view schedules, caregivers, invoices, and manage their profile.

## Features

- 🔐 **Secure Login** — Email + agency-provided access code
- 📅 **My Schedule** — View upcoming and past care visits
- 👩‍⚕️ **My Caregivers** — Care team profiles, skills, languages
- 💰 **Invoices** — Billing history, payment status, invoice details
- 👤 **Profile** — Edit contact info, emergency contacts, preferences

## Tech Stack

- React 18 + TypeScript
- DaisyUI / Tailwind CSS (mobile-first)
- Connects to GoToCare Payload CMS backend

## Backend API

- `POST /api/client-login` — Authenticate with email + access code
- `GET /api/client-portal/schedule?clientId=X` — Client's shifts
- `GET /api/client-portal/caregivers?clientId=X` — Assigned caregivers
- `GET /api/client-portal/invoices?clientId=X` — Client's invoices
- `GET /api/client-portal/profile?clientId=X` — Client profile
- `POST /api/client-portal/profile?clientId=X` — Update profile

## Development

This is a GoToCare instant app. Preview it in the Tasklet dashboard or deploy to Cloudflare Pages.

## License

Proprietary — GoToCare © 2025
