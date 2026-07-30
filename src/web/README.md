# DataDrop Web

The DataDrop frontend, rebuilt with **React + Vite + Tailwind CSS** in a light theme.

## Structure

Multi-page app whose entry points map to the CloudFront routes:

| Route     | HTML entry    | Page component               |
| --------- | ------------- | ---------------------------- |
| `/`       | `index.html`  | static landing page, no JS   |
| `/app`    | `app.html`    | `src/pages/Dashboard.jsx`    |
| `/file`   | `file.html`   | `src/pages/FileDownload.jsx` |
| `/upload` | `upload.html` | `src/pages/PublicUpload.jsx` |
| `/admin`  | `admin.html`  | `src/pages/Admin.jsx`        |

`/` is deliberately plain HTML plus the compiled Tailwind stylesheet: no React
bundle and no API calls, so the landing route renders as soon as CloudFront
responds. Its markup lives directly in `index.html` and mirrors the shared
`Logo`/`Background` components. Everything interactive happens under `/app`,
which verifies the session and redirects to the identity provider when needed.
After login the API sends users back to `/app`.

Shared logic lives in `src/lib` (API, formatting, upload/multipart, filters,
folders) and reusable UI in `src/components`.

## Local development

```bash
npm install
npm run dev
```

The dev server proxies `/api` to `http://localhost:3000` and rewrites the
extensionless routes (`/app`, `/file`, `/upload`, `/admin`) to their HTML
entries, matching the CloudFront behaviors (see `vite.config.js`).

## Production build

```bash
npm ci
npm run build   # outputs static assets to dist/
```

## Deployment

You normally never run the build by hand for deployment — Terraform does it.
On `terraform apply`, the `null_resource.frontend_build` in
`terraform/frontend.tf` runs `npm ci && npm run build`, syncs `dist/` to the
frontend S3 bucket, and invalidates the CloudFront distribution.

Requires `npm` and the `aws` CLI on the machine running Terraform.
