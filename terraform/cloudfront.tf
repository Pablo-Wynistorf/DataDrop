# CloudFront Origin Access Control for frontend
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Origin Access Control for CDN files
resource "aws_cloudfront_origin_access_control" "cdn_files" {
  name                              = "${var.project_name}-cdn-files-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Function to strip /cdn/ prefix for S3 origin requests
resource "aws_cloudfront_function" "cdn_rewrite" {
  name    = "${var.project_name}-cdn-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOF
    function handler(event) {
      var request = event.request;
      
      // Strip /cdn/ prefix so S3 can find the file
      if (request.uri.startsWith('/cdn/')) {
        request.uri = request.uri.substring(4);
      }
      
      return request;
    }
  EOF
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  # S3 Frontend Origin
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # S3 CDN Files Origin
  origin {
    domain_name              = aws_s3_bucket.cdn_files.bucket_regional_domain_name
    origin_id                = "cdn-files"
    origin_access_control_id = aws_cloudfront_origin_access_control.cdn_files.id
  }

  # API Gateway Origin
  origin {
    domain_name = replace(aws_apigatewayv2_api.main.api_endpoint, "https://", "")
    origin_id   = "api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Default behavior - S3 frontend
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "frontend"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # CDN files behavior - direct download from S3 via OAC
  ordered_cache_behavior {
    path_pattern           = "/cdn/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "cdn-files"
    viewer_protocol_policy = "redirect-to-https"

    # Strip /cdn/ prefix before requesting from S3
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.cdn_rewrite.arn
    }

    # Use cache policy instead of forwarded_values for better header handling
    cache_policy_id            = aws_cloudfront_cache_policy.cdn_files.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.cdn_files.id
  }

  # API behavior
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "api"
    viewer_protocol_policy = "redirect-to-https"

    # Use managed policies
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  # File download page - serve /file as static page
  ordered_cache_behavior {
    path_pattern           = "/file"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "frontend"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Use AWS managed cache policy (CachingDisabled)
data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

# Use AWS managed origin request policy (AllViewerExceptHostHeader)
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# Cache policy for CDN files - caches based on origin headers
resource "aws_cloudfront_cache_policy" "cdn_files" {
  name        = "${var.project_name}-cdn-files-cache"
  min_ttl     = 0
  default_ttl = 86400
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# Response headers policy for CDN files - ensures Content-Type is passed through
resource "aws_cloudfront_response_headers_policy" "cdn_files" {
  name = "${var.project_name}-cdn-files-response"

  cors_config {
    access_control_allow_credentials = false
    access_control_allow_headers {
      items = ["*"]
    }
    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS"]
    }
    access_control_allow_origins {
      items = ["*"]
    }
    origin_override = false
  }

  security_headers_config {
    content_type_options {
      override = false
    }
  }
}
