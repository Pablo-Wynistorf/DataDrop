############################
# Build configuration
############################

locals {
  lambda_deletion_build_dir = "${path.module}/.build-lambda-deletion"
}

data "aws_caller_identity" "lambda_deletion" {}

resource "null_resource" "lambda_deletion_build_dir" {
  provisioner "local-exec" {
    command = "mkdir -p ${local.lambda_deletion_build_dir}"
  }
}

############################
# Lambda execution role
############################

resource "aws_iam_role" "lambda_deletion" {
  name = "${var.project_name}-lambda-deletion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_deletion" {
  name = "${var.project_name}-lambda-deletion-policy"
  role = aws_iam_role.lambda_deletion.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.file_deletion.arn
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:DeleteItem"]
        Resource = aws_dynamodb_table.files.arn
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:DescribeStream", "dynamodb:GetRecords", "dynamodb:GetShardIterator", "dynamodb:ListStreams"]
        Resource = "${aws_dynamodb_table.files.arn}/stream/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:DeleteObject"]
        Resource = [
          "${aws_s3_bucket.files.arn}/*",
          "${aws_s3_bucket.cdn_files.arn}/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = aws_cloudfront_distribution.main.arn
      }
    ]
  })
}

############################
# Build & package Lambda
############################

resource "null_resource" "lambda_deletion_npm_install" {
  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    command     = "npm ci --omit=dev"
    working_dir = "${path.module}/../src/lambda/deletion"
  }
}

data "archive_file" "lambda_deletion_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../src/lambda/deletion"
  output_path = "${local.lambda_deletion_build_dir}/lambda-deletion.zip"

  depends_on = [
    null_resource.lambda_deletion_build_dir,
    null_resource.lambda_deletion_npm_install
  ]
}

############################
# Artifact storage (S3)
############################

resource "aws_s3_bucket" "lambda_deletion_artifacts" {
  bucket = "${var.project_name}-lambda-deletion-artifacts-${data.aws_caller_identity.lambda_deletion.account_id}"
}

resource "aws_s3_object" "lambda_deletion_object" {
  bucket       = aws_s3_bucket.lambda_deletion_artifacts.id
  key          = "lambda/${data.archive_file.lambda_deletion_zip.output_base64sha256}.zip"
  source       = data.archive_file.lambda_deletion_zip.output_path
  content_type = "application/zip"
}

############################
# Lambda function
############################

resource "aws_lambda_function" "file_deletion" {
  function_name = "${var.project_name}-file-deletion"
  role          = aws_iam_role.lambda_deletion.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 128

  s3_bucket = aws_s3_object.lambda_deletion_object.bucket
  s3_key    = aws_s3_object.lambda_deletion_object.key

  source_code_hash = data.archive_file.lambda_deletion_zip.output_base64sha256

  environment {
    variables = {
      BUCKET_NAME                = aws_s3_bucket.files.id
      CDN_BUCKET_NAME            = aws_s3_bucket.cdn_files.id
      FILES_TABLE                = aws_dynamodb_table.files.name
      CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.main.id
    }
  }

  depends_on = [aws_s3_object.lambda_deletion_object]
}

############################
# DynamoDB Stream mapping
############################

resource "aws_lambda_event_source_mapping" "dynamodb_stream" {
  event_source_arn  = aws_dynamodb_table.files.stream_arn
  function_name     = aws_lambda_function.file_deletion.arn
  starting_position = "LATEST"
  batch_size        = 10

  filter_criteria {
    filter {
      pattern = jsonencode({
        userIdentity = {
          type        = ["Service"]
          principalId = ["dynamodb.amazonaws.com"]
        }
      })
    }
  }
}
