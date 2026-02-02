# Lambda execution role for file deletion
resource "aws_iam_role" "lambda_deletion" {
  name = "${var.project_name}-lambda-deletion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_deletion" {
  name = "${var.project_name}-lambda-deletion-policy"
  role = aws_iam_role.lambda_deletion.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.file_deletion.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:DeleteItem"
        ]
        Resource = aws_dynamodb_table.files.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeStream",
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:ListStreams"
        ]
        Resource = "${aws_dynamodb_table.files.arn}/stream/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:DeleteObject"
        ]
        Resource = [
          "${aws_s3_bucket.files.arn}/*",
          "${aws_s3_bucket.cdn_files.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cloudfront:CreateInvalidation"
        ]
        Resource = aws_cloudfront_distribution.main.arn
      }
    ]
  })
}

# Install npm dependencies for deletion Lambda
resource "null_resource" "lambda_deletion_npm_install" {
  triggers = {
    package_json = filemd5("${path.module}/../src/lambda/deletion/package.json")
  }

  provisioner "local-exec" {
    command     = "npm install --production"
    working_dir = "${path.module}/../src/lambda/deletion"
  }
}

# Package deletion Lambda code
data "archive_file" "lambda_deletion" {
  type        = "zip"
  source_dir  = "${path.module}/../src/lambda/deletion"
  output_path = "${path.module}/.terraform/lambda-deletion.zip"
  depends_on  = [null_resource.lambda_deletion_npm_install]
}

# File deletion Lambda function
resource "aws_lambda_function" "file_deletion" {
  filename         = data.archive_file.lambda_deletion.output_path
  function_name    = "${var.project_name}-file-deletion"
  role             = aws_iam_role.lambda_deletion.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda_deletion.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      BUCKET_NAME              = aws_s3_bucket.files.id
      CDN_BUCKET_NAME          = aws_s3_bucket.cdn_files.id
      FILES_TABLE              = aws_dynamodb_table.files.name
      CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.main.id
    }
  }
}

# DynamoDB Streams event source mapping for TTL-triggered deletions
resource "aws_lambda_event_source_mapping" "dynamodb_stream" {
  event_source_arn  = aws_dynamodb_table.files.stream_arn
  function_name     = aws_lambda_function.file_deletion.arn
  starting_position = "LATEST"
  batch_size        = 10

  # Filter for TTL deletions only (userIdentity is set by DynamoDB for TTL deletes)
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
