output "cloudfront_url" {
  description = "CloudFront distribution URL"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "api_url" {
  description = "API Gateway URL"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "files_bucket" {
  description = "S3 bucket for private file uploads"
  value       = aws_s3_bucket.files.id
}

output "cdn_files_bucket" {
  description = "S3 bucket for CDN/public file uploads"
  value       = aws_s3_bucket.cdn_files.id
}

output "frontend_bucket" {
  description = "S3 bucket for frontend"
  value       = aws_s3_bucket.frontend.id
}

output "oidc_redirect_uri" {
  description = "OIDC redirect URI to configure in your provider"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}/api/auth/callback"
}

output "file_deletion_queue_url" {
  description = "SQS queue URL for file deletion"
  value       = aws_sqs_queue.file_deletion.url
}

output "file_deletion_dlq_url" {
  description = "Dead letter queue URL for failed file deletions"
  value       = aws_sqs_queue.file_deletion_dlq.url
}
