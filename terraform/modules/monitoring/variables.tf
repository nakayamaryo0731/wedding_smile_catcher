variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "alert_email" {
  description = "Email address for alert notifications"
  type        = string
}

variable "webhook_function_name" {
  description = "Name of the webhook Cloud Function"
  type        = string
  default     = "webhook"
}

variable "scoring_function_name" {
  description = "Name of the scoring Cloud Function"
  type        = string
  default     = "scoring"
}
