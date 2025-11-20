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

variable "zone" {
  description = "GCP Zone"
  type        = string
  default     = "asia-northeast1-a"
}

# Storage Configuration
variable "storage_bucket_name" {
  description = "Cloud Storage bucket name for images"
  type        = string
  default     = "wedding-smile-images-wedding-smile-catcher"
}

variable "tfstate_bucket_name" {
  description = "Cloud Storage bucket name for Terraform state"
  type        = string
  default     = "wedding-smile-catcher-tfstate"
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

# Vertex AI Configuration
variable "vertex_ai_model" {
  description = "Vertex AI model name"
  type        = string
  default     = "gemini-1.5-flash"
}

# Scoring Parameters
variable "similarity_threshold" {
  description = "Average Hash similarity threshold"
  type        = number
  default     = 8
}

variable "similarity_penalty" {
  description = "Penalty for similar images"
  type        = number
  default     = 0.33
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
