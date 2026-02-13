variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for Cloud Functions"
  type        = string
  default     = "asia-northeast1"
}

variable "storage_bucket_name" {
  description = "Cloud Storage bucket name for function source code and images"
  type        = string
}

variable "webhook_service_account_email" {
  description = "Service account email for webhook function"
  type        = string
}

variable "scoring_service_account_email" {
  description = "Service account email for scoring function"
  type        = string
}

variable "line_channel_secret_name" {
  description = "Secret Manager secret name for LINE channel secret"
  type        = string
  default     = "line-channel-secret"
}

variable "line_channel_access_token_name" {
  description = "Secret Manager secret name for LINE channel access token"
  type        = string
  default     = "line-channel-access-token"
}

variable "liff_channel_id_name" {
  description = "Secret Manager secret name for LIFF LINE Login channel ID"
  type        = string
  default     = "liff-channel-id"
}
