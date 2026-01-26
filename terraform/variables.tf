# Project Configuration
variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "wedding-smile-catcher"
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "asia-northeast1"
}

# Storage Configuration
variable "storage_bucket_name" {
  description = "Cloud Storage bucket name for images"
  type        = string
  default     = "wedding-smile-images-wedding-smile-catcher"
}

# Firestore Configuration
variable "firestore_location" {
  description = "Firestore database location"
  type        = string
  default     = "asia-northeast1"
}

# LINE Bot Configuration
# NOTE: These variables have lifecycle ignore_changes, so default values are safe to use
# Actual secrets are managed separately and won't be overwritten
variable "line_channel_secret" {
  description = "LINE Channel Secret (stored in Secret Manager)"
  type        = string
  sensitive   = true
  default     = "placeholder-managed-externally"
}

variable "line_channel_access_token" {
  description = "LINE Channel Access Token (stored in Secret Manager)"
  type        = string
  sensitive   = true
  default     = "placeholder-managed-externally"
}

# Event Configuration (temporary, will be removed with multi-tenant support)
variable "current_event_id" {
  description = "Current event ID for single-tenant mode"
  type        = string
  default     = "fde25512-7df4-4b24-87fb-59cc8405cc17"
}

# Labels (for resource organization)
variable "labels" {
  description = "Common labels for all resources"
  type        = map(string)
  default = {
    project     = "wedding-smile-catcher"
    environment = "production"
    managed_by  = "terraform"
    team        = "wedding-tech"
  }
}
