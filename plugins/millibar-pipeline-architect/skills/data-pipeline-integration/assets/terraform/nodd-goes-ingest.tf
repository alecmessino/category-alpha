###############################################################################
# NODD event-driven GOES ingestion.
#
# NOAA NODD publishes an SNS notification on every new object in the public GOES
# buckets. This module subscribes an SQS queue to that topic and drives a Lambda
# worker off the queue — no polling loop anywhere in the chain.
#
# The worker reads the GOES bucket ANONYMOUSLY. Its execution role deliberately
# carries no s3:GetObject grant against noaa-goes*: the bucket is public, a signed
# request from a role without a trust path returns 403 AccessDenied, and that 403
# is indistinguishable from a missing object. See nodd_worker.py.
#
#   terraform init && terraform apply -var="satellite=19"
###############################################################################

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  description = "NODD SNS topics live in us-east-1; keep the consumer there to avoid cross-region delivery cost."
  type        = string
  default     = "us-east-1"
}

variable "satellite" {
  description = "GOES satellite number. 19 = operational GOES-East, 18 = operational GOES-West."
  type        = string
  default     = "19"

  validation {
    condition     = contains(["16", "17", "18", "19"], var.satellite)
    error_message = "satellite must be one of 16, 17, 18, 19."
  }
}

variable "product_prefix" {
  description = "ABI/GLM product prefix to subscribe to. Subscribe per product, never per bucket — ABI-L1b-RadM1 alone is one object per minute per sector."
  type        = string
  default     = "ABI-L2-CMIPF/"
}

variable "derived_bucket" {
  description = "Bucket the worker writes derived artifacts and the manifest into."
  type        = string
  default     = "millibar-derived-imagery"
}

variable "nodd_account_id" {
  description = "NOAA NODD publisher account that owns the NewGOES* topics."
  type        = string
  default     = "123901341784"
}

locals {
  name            = "millibar-nodd-goes${var.satellite}"
  source_bucket   = "noaa-goes${var.satellite}"
  nodd_topic_arn  = "arn:aws:sns:${var.region}:${var.nodd_account_id}:NewGOES${var.satellite}Object"
}

###############################################################################
# Queue + DLQ
#
# The queue is the buffer. GLM publishes ~180 notifications an hour; a synchronous
# SNS->Lambda subscription throttles and drops under that, SQS absorbs it.
#
# The redrive policy is mandatory, not optional hygiene: without a DLQ a single
# unparseable notification redelivers until the retention window expires and every
# later object queues behind it.
###############################################################################

resource "aws_sqs_queue" "dlq" {
  name                      = "${local.name}-dlq"
  message_retention_seconds = 1209600 # 14 days — long enough to diagnose a bad message
}

resource "aws_sqs_queue" "ingest" {
  name                       = local.name
  visibility_timeout_seconds = 180 # >= 6x the Lambda timeout, per Lambda/SQS guidance
  message_retention_seconds  = 3600
  receive_wait_time_seconds  = 20 # long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })
}

# Cross-account write from the NODD topic. The aws:SourceArn condition is the part
# most often got wrong: omit it and any SNS topic in any account can write here;
# point it at the wrong ARN and NODD's deliveries are rejected, leaving a queue that
# looks -- from the console -- exactly like a quiet satellite.
data "aws_iam_policy_document" "queue_policy" {
  statement {
    sid    = "AllowNODDSNSDelivery"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.ingest.arn]

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [local.nodd_topic_arn]
    }
  }
}

resource "aws_sqs_queue_policy" "ingest" {
  queue_url = aws_sqs_queue.ingest.id
  policy    = data.aws_iam_policy_document.queue_policy.json
}

###############################################################################
# Subscription
#
# NODD messages are S3 Event Notification envelopes, so the key we filter on lives
# in the message BODY, not in message attributes. filter_policy_scope = MessageBody
# is what makes the policy below match anything at all -- leaving the default
# MessageAttributes scope with a body-shaped policy drops every message silently
# and presents as "the feed stopped".
#
# Validate by replaying one captured NODD notification through the topic and
# asserting ApproximateNumberOfMessagesVisible moves.
###############################################################################

resource "aws_sns_topic_subscription" "nodd" {
  topic_arn = local.nodd_topic_arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.ingest.arn

  raw_message_delivery = false
  filter_policy_scope  = "MessageBody"

  filter_policy = jsonencode({
    Records = {
      s3 = {
        object = {
          key = [{ prefix = var.product_prefix }]
        }
      }
    }
  })
}

###############################################################################
# Worker
###############################################################################

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker" {
  name               = "${local.name}-worker"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# No s3:GetObject on noaa-goes* here, and that is deliberate: the source bucket is
# read unsigned. Granting it would not help and would invite someone to "fix" the
# worker by signing its requests.
data "aws_iam_policy_document" "worker" {
  statement {
    effect  = "Allow"
    actions = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [aws_sqs_queue.ingest.arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["arn:aws:s3:::${var.derived_bucket}/*"]
  }
}

resource "aws_iam_role_policy" "worker" {
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker.json
}

data "archive_file" "worker" {
  type        = "zip"
  source_file = "${path.module}/../python/nodd_worker.py"
  output_path = "${path.module}/.build/nodd_worker.zip"
}

resource "aws_lambda_function" "worker" {
  function_name    = "${local.name}-worker"
  role             = aws_iam_role.worker.arn
  handler          = "nodd_worker.handler"
  runtime          = "python3.11"
  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256
  timeout          = 30
  memory_size      = 1024 # a full-disk CMIP array does not fit comfortably in 512 MB

  environment {
    variables = {
      SOURCE_BUCKET  = local.source_bucket
      DERIVED_BUCKET = var.derived_bucket
      PRODUCT_PREFIX = var.product_prefix
    }
  }
}

resource "aws_lambda_event_source_mapping" "ingest" {
  event_source_arn                   = aws_sqs_queue.ingest.arn
  function_name                      = aws_lambda_function.worker.arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"] # partial-batch failure
}

###############################################################################
# Alarm: silence is the failure mode that hides.
#
# Every misconfiguration in this chain -- wrong filter scope, wrong SourceArn,
# wrong topic name -- produces an EMPTY QUEUE, which looks identical to a healthy
# pipeline between scans. Alarm on the absence of traffic, not just on errors.
###############################################################################

resource "aws_cloudwatch_metric_alarm" "no_deliveries" {
  alarm_name          = "${local.name}-no-deliveries"
  namespace           = "AWS/SQS"
  metric_name         = "NumberOfMessagesSent"
  statistic           = "Sum"
  period              = 900 # 15 min > the 10-min full-disk cadence, with headroom
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    QueueName = aws_sqs_queue.ingest.name
  }
}

output "queue_url" {
  value = aws_sqs_queue.ingest.id
}

output "subscribed_topic" {
  value = local.nodd_topic_arn
}
