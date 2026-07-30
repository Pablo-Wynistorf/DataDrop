# --------------------------------------------------------------------------
# Frontend build & deploy
#
# The React/Vite app in src/web is built during `terraform apply` and its
# compiled output is uploaded to the frontend S3 bucket, followed by a
# CloudFront invalidation. Requires `npm` and the `aws` CLI on the machine
# running Terraform (the AWS CLI uses the same credentials as the provider).
# --------------------------------------------------------------------------

locals {
  web_src_dir = "${path.module}/../src/web"

  # Hash of the frontend source (excluding node_modules/ and dist/) so the
  # build re-runs only when something meaningful changes.
  web_config_files = [
    "package.json",
    "package-lock.json",
    "vite.config.js",
    "tailwind.config.js",
    "postcss.config.js",
    "index.html",
    "app.html",
    "file.html",
    "upload.html",
    "admin.html",
  ]

  web_source_hash = sha1(join("", concat(
    [for f in fileset(local.web_src_dir, "src/**") : filesha1("${local.web_src_dir}/${f}")],
    [for f in fileset(local.web_src_dir, "public/**") : filesha1("${local.web_src_dir}/${f}")],
    [for f in local.web_config_files : filesha1("${local.web_src_dir}/${f}")],
  )))
}

resource "null_resource" "frontend_build" {
  triggers = {
    source_hash  = local.web_source_hash
    bucket       = aws_s3_bucket.frontend.id
    distribution = aws_cloudfront_distribution.main.id
  }

  provisioner "local-exec" {
    working_dir = local.web_src_dir
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      set -euo pipefail

      echo "==> Installing frontend dependencies"
      npm ci

      echo "==> Building React frontend"
      npm run build

      echo "==> Syncing assets to s3://${aws_s3_bucket.frontend.id}"
      # Hashed, immutable build assets get a long cache lifetime. The HTML
      # entrypoints are handled separately below so they are never excluded
      # from cache invalidation.
      aws s3 sync dist/ "s3://${aws_s3_bucket.frontend.id}/" \
        --region "${var.aws_region}" \
        --delete \
        --exclude "index.html" \
        --exclude "app.html" \
        --exclude "file.html" \
        --exclude "upload.html" \
        --exclude "admin.html" \
        --cache-control "public,max-age=31536000,immutable"

      echo "==> Uploading HTML entrypoints"
      # "/" -> index.html, "/app" -> key "app", "/file" -> key "file",
      # "/upload" -> key "upload", "/admin" -> key "admin" (CloudFront
      # behaviors map those paths to these S3 keys).
      #
      # The landing page is static and never changes between deploys other than
      # its asset hashes, so let CloudFront hold it at the edge (s-maxage) while
      # browsers revalidate (max-age=0). Deploys invalidate the distribution, so
      # a stale edge copy is never served after a release.
      aws s3 cp dist/index.html "s3://${aws_s3_bucket.frontend.id}/index.html" \
        --region "${var.aws_region}" --content-type "text/html" \
        --cache-control "public,max-age=0,s-maxage=86400,must-revalidate"
      aws s3 cp dist/app.html "s3://${aws_s3_bucket.frontend.id}/app" \
        --region "${var.aws_region}" --content-type "text/html" --cache-control "no-cache"
      aws s3 cp dist/file.html "s3://${aws_s3_bucket.frontend.id}/file" \
        --region "${var.aws_region}" --content-type "text/html" --cache-control "no-cache"
      aws s3 cp dist/upload.html "s3://${aws_s3_bucket.frontend.id}/upload" \
        --region "${var.aws_region}" --content-type "text/html" --cache-control "no-cache"
      aws s3 cp dist/admin.html "s3://${aws_s3_bucket.frontend.id}/admin" \
        --region "${var.aws_region}" --content-type "text/html" --cache-control "no-cache"

      echo "==> Invalidating CloudFront distribution ${aws_cloudfront_distribution.main.id}"
      aws cloudfront create-invalidation \
        --distribution-id "${aws_cloudfront_distribution.main.id}" \
        --paths "/*" >/dev/null

      echo "==> Frontend deploy complete"
    EOT
  }

  depends_on = [
    aws_s3_bucket_policy.frontend,
    aws_cloudfront_distribution.main,
  ]
}
