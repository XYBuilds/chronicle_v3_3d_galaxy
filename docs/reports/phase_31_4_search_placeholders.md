# Phase 31.4 — Search placeholder copy

## Goal

Clarify SearchBar placeholder text so users know movie titles can be searched in English or the original language, and people search works best with English names—without changing search logic or other locales (deferred to 31.5).

## Decisions

- Updated only `en.json` as the English SSOT for 31.4; other locale bundles unchanged until 31.5 i18n sync.
- Left `searchBar.placeholderGenre` unchanged (`Drama / Comedy / Thriller …`).

## Implementation

| Key | New copy |
| --- | --- |
| `searchBar.placeholderMovie` | Search English or original titles… |
| `searchBar.placeholderPerson` | Search people by English name… |

No changes to `SearchBar.tsx` or `strings.ts` (existing keys and export shape).

## Verification

- `npx vitest run src/lib/locales/locales.schema.spec.ts` — 12 passed

## Risks / follow-ups

- Non-English UI locales still show pre-31.4 placeholder translations until 31.5.
- Product does not yet support localized person-name search; copy sets expectations only.
