variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "database_name" {
  description = "Firestore database name"
  type        = string
  default     = "(default)"
}

variable "location_id" {
  description = "Firestore database location"
  type        = string
}

variable "database_type" {
  description = "Firestore database type (FIRESTORE_NATIVE or DATASTORE_MODE)"
  type        = string
  default     = "FIRESTORE_NATIVE"
}

variable "deletion_policy" {
  description = "Deletion policy (DELETE or ABANDON)"
  type        = string
  default     = "DELETE"
}

variable "point_in_time_recovery_enabled" {
  description = "Enable point-in-time recovery for the database"
  type        = bool
  default     = false
}
