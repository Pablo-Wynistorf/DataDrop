# DataDrop Web

The DataDrop frontend, rebuilt with **React + Vite + Tailwind CSS** in a light theme.

## Structure

Multi-page app with three entry points that map to the CloudFront routes:

| Route      | HTML entry     | Page component                  |
| ---------- | -------------- | ------------------------------- |
| `/`        | `index.html`   | `src/pages/Dashboard.jsx`       |
| `/file`    | `file.html`    | `src/pages/FileDownload.jsx`    |
| `/upload`  | `upload.html`  | `src/pages/PublicUpload.jsx`    |

Shared logic lives in `src/lib` (API, formatting, upload/multipart, filters,
folders) and reusable UI in `src/components`.

## Local development

```bash
npm install
npm run dev
```

The dev server proxies `/api` to `http://localhost:3000` (see `vite.config.js`).

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
