# Private files bucket for uploads (JWT-protected downloads)
resource "aws_s3_bucket" "files" {
  bucket_prefix = "${var.project_name}-files-"
  force_destroy = true
}

resource "aws_s3_bucket_cors_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket = aws_s3_bucket.files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CDN files bucket (public via CloudFront OAC)
resource "aws_s3_bucket" "cdn_files" {
  bucket_prefix = "${var.project_name}-cdn-files-"
  force_destroy = true
}

resource "aws_s3_bucket_cors_configuration" "cdn_files" {
  bucket = aws_s3_bucket.cdn_files.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_public_access_block" "cdn_files" {
  bucket = aws_s3_bucket.cdn_files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "cdn_files" {
  bucket = aws_s3_bucket.cdn_files.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontAccess"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.cdn_files.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })
}

# Frontend bucket
resource "aws_s3_bucket" "frontend" {
  bucket_prefix = "${var.project_name}-frontend-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontAccess"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })
}

# Upload frontend files
resource "aws_s3_object" "frontend_index" {
  bucket       = aws_s3_bucket.frontend.id
  key          = "index.html"
  source       = "${path.module}/../src/frontend/index.html"
  content_type = "text/html"
  etag         = filemd5("${path.module}/../src/frontend/index.html")
}

resource "aws_s3_object" "frontend_file" {
  bucket       = aws_s3_bucket.frontend.id
  key          = "file"
  source       = "${path.module}/../src/frontend/file/index.html"
  content_type = "text/html"
  etag         = filemd5("${path.module}/../src/frontend/file/index.html")
}

resource "aws_s3_object" "frontend_app_js" {
  bucket       = aws_s3_bucket.frontend.id
  key          = "js/app.js"
  source       = "${path.module}/../src/frontend/js/app.js"
  content_type = "application/javascript"
  etag         = filemd5("${path.module}/../src/frontend/js/app.js")
}

resource "aws_s3_object" "frontend_file_js" {
  bucket       = aws_s3_bucket.frontend.id
  key          = "js/file.js"
  source       = "${path.module}/../src/frontend/js/file.js"
  content_type = "application/javascript"
  etag         = filemd5("${path.module}/../src/frontend/js/file.js")
}

resource "aws_s3_object" "frontend_favicon" {
  bucket       = aws_s3_bucket.frontend.id
  key          = "favicon.svg"
  source       = "${path.module}/../src/frontend/favicon.svg"
  content_type = "image/svg+xml"
  etag         = filemd5("${path.module}/../src/frontend/favicon.svg")
}