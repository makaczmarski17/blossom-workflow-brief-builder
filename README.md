# Blossom Workflow Brief Builder

A local AI prototype that turns de-identified field intelligence into a structured Workflow Brief using the OpenAI Responses API. It preserves evidence qualifications, source-supported workflow stages, open questions, and review requirements.

## Requirements

- Node.js 20 or newer
- pnpm (npm also works)
- An OpenAI API key

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local`.
3. Set the required `OPENAI_API_KEY` value in `.env.local`. Never commit or share this file.
4. Run `pnpm dev`.
5. Open `http://127.0.0.1:5173`.

The API key is read by the server and is not exposed to browser code.

## Input safety

Before an OpenAI request is made, the server screens Field notes and Supporting evidence for common high-confidence patterns such as contact details, credentials, account or case identifiers, infrastructure details, and explicit confidentiality markers. Flagged submissions are blocked with category-only guidance; the app does not silently redact or persist their text.

This screen is not complete protection against every sensitive detail. Contributors must remove or generalize personal, customer-confidential, credential, and security-sensitive information before submitting. Clean submissions are sent to the OpenAI API, and the request uses `store: false`. Generated output is also instructed to exclude or generalize identifying details.

## Human review

Every result is an AI-assisted draft requiring Content Marketing review and human review before external use. Legal / Privacy review is recommended when the generated brief indicates that the source context warrants it. The app does not claim anonymity, legal compliance, or approval.

## Commands

- `pnpm dev` — run the local development server.
- `pnpm test` — run the automated tests.
- `pnpm build` — type-check and create the production client and server builds.
- `pnpm start` — run the production build locally.
