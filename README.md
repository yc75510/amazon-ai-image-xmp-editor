# Amazon Synthetic Performer XMP Tool

A browser-only tool for batch-writing and verifying Amazon's
`contains-synthetic-performer` XMP tag in JPG and PNG images. Selected images
are processed locally in the browser and are never uploaded.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: generate the static `out/` directory
- `npm test`: build and verify the exported page

## Deployment

Pushing to `main` deploys the static `out/` directory to GitHub Pages through
the included GitHub Actions workflow. In the repository settings, set Pages to
use **GitHub Actions** as its source.
