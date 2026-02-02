# SQS Queue for file deletion
resource "aws_sqs_queue" "file_deletion" {
  name                       = "${var.project_name}-file-deletion"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 86400  # 1 day
  receive_wait_time_seconds  = 10

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.file_deletion_dlq.arn
    maxReceiveCount     = 3
  })
}

# Dead letter queue for failed deletions
resource "aws_sqs_queue" "file_deletion_dlq" {
  name                      = "${var.project_name}-file-deletion-dlq"
  message_retention_seconds = 1209600  # 14 days
}

# Allow Lambda to receive messages from SQS
resource "aws_lambda_event_source_mapping" "file_deletion" {
  event_source_arn = aws_sqs_queue.file_deletion.arn
  function_name    = aws_lambda_function.file_deletion.arn
  batch_size       = 10
}
