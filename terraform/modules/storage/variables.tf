variable "bucket_name" {
  description = "Name of the Cloud Storage bucket for images"
  type        = string
}

variable "region" {
  description = "GCP region for the bucket"
  type        = string
}

variable "force_destroy" {
  description = "Allow bucket deletion even if it contains objects (use with caution)"
  type        = bool
  default     = false
}

variable "cors_origins" {
  description = "Allowed origins for CORS (for frontend access)"
  type        = list(string)
  default     = ["*"]
}

variable "lifecycle_age_days" {
  description = "Number of days after which objects are deleted (0 = disabled)"
  type        = number
  default     = 0
}

variable "versioning_enabled" {
  description = "Enable versioning for objects in the bucket"
  type        = bool
  default     = false
}

variable "labels" {
  description = "Labels to apply to the bucket"
  type        = map(string)
  default     = {}
}

variable "project_id" {
  description = "GCP project ID (for service account permissions)"
  type        = string
}
