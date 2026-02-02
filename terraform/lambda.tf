############################
# Build configuration
############################

locals {
  lambda_api_build_dir = "${path.module}/.build-lambda-api"
}

data "aws_caller_identity" "lambda_api" {}

resource "null_resource" "lambda_api_build_dir" {
  provisioner "local-exec" {
    command = "mkdir -p ${local.lambda_api_build_dir}"
  }
}

############################
# Lambda execution role
############################

resource "aws_iam_role" "lambda" {
  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda" {
  name = "${var.project_name}-lambda-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.sessions.arn,
          aws_dynamodb_table.files.arn,
          "${aws_dynamodb_table.files.arn}/index/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = [
          "${aws_s3_bucket.files.arn}/*",
          "${aws_s3_bucket.cdn_files.arn}/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.file_deletion.arn
      }
    ]
  })
}

############################
# Build & package Lambda
############################

resource "null_resource" "lambda_api_npm_install" {
  triggers = {
    package_json = filemd5("${path.module}/../src/lambda/api/package.json")
    package_lock = try(filemd5("${path.module}/../src/lambda/api/package-lock.json"), "")
  }

  provisioner "local-exec" {
    command     = "npm ci --omit=dev"
    working_dir = "${path.module}/../src/lambda/api"
  }
}

data "archive_file" "lambda_api_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../src/lambda/api"
  output_path = "${local.lambda_api_build_dir}/lambda-api.zip"

  depends_on = [
    null_resource.lambda_api_build_dir,
    null_resource.lambda_api_npm_install
  ]
}

############################
# Artifact storage (S3)
############################

resource "aws_s3_bucket" "lambda_api_artifacts" {
  bucket = "${var.project_name}-lambda-api-artifacts-${data.aws_caller_identity.lambda_api.account_id}"
}

resource "aws_s3_object" "lambda_api_object" {
  bucket       = aws_s3_bucket.lambda_api_artifacts.id
  key          = "lambda/${data.archive_file.lambda_api_zip.output_base64sha256}.zip"
  source       = data.archive_file.lambda_api_zip.output_path
  content_type = "application/zip"
}

############################
# Lambda function
############################

resource "aws_lambda_function" "api" {
  function_name = "${var.project_name}-api"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  s3_bucket = aws_s3_object.lambda_api_object.bucket
  s3_key    = aws_s3_object.lambda_api_object.key

  source_code_hash = data.archive_file.lambda_api_zip.output_base64sha256

  environment {
    variables = {
      BUCKET_NAME             = aws_s3_bucket.files.id
      CDN_BUCKET_NAME         = aws_s3_bucket.cdn_files.id
      CDN_URL                 = "https://${var.domain_name != "" ? var.domain_name : aws_cloudfront_distribution.main.domain_name}/cdn"
      FILES_TABLE             = aws_dynamodb_table.files.name
      SESSIONS_TABLE          = aws_dynamodb_table.sessions.name
      OIDC_ISSUER             = var.oidc_issuer
      OIDC_CLIENT_ID          = var.oidc_client_id
      OIDC_CLIENT_SECRET      = var.oidc_client_secret
      REDIRECT_URI            = "https://${var.domain_name != "" ? var.domain_name : aws_cloudfront_distribution.main.domain_name}/api/auth/callback"
      FRONTEND_URL            = "https://${var.domain_name != "" ? var.domain_name : aws_cloudfront_distribution.main.domain_name}"
      JWT_SECRET              = var.jwt_secret
      FILE_DELETION_QUEUE_URL = aws_sqs_queue.file_deletion.url
    }
  }

  depends_on = [aws_s3_object.lambda_api_object]
}

############################
# API Gateway permission
############################

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
