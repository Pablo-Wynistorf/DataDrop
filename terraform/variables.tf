variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "datadrop"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "oidc_issuer" {
  description = "OIDC provider issuer URL"
  type        = string
}

variable "oidc_client_id" {
  description = "OIDC client ID"
  type        = string
}

variable "oidc_client_secret" {
  description = "OIDC client secret"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "Secret key for signing JWT tokens for private file sharing"
  type        = string
  sensitive   = true
  default     = ""
}
