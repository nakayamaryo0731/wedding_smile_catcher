# Firestore database for wedding smile catcher application
# Stores user information, image metadata, and rankings

resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = var.database_name
  location_id = var.location_id
  type        = var.database_type

  # Deletion protection for production safety
  deletion_policy = var.deletion_policy

  # Point-in-time recovery for data protection
  point_in_time_recovery_enablement = var.point_in_time_recovery_enabled ? "POINT_IN_TIME_RECOVERY_ENABLED" : "POINT_IN_TIME_RECOVERY_DISABLED"
}

# NOTE: Firestore Security Rules are managed by Firebase CLI, not Terraform.
# Deploy rules using: firebase deploy --only firestore:rules
# This prevents drift between /firestore.rules and Terraform state.
