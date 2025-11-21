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

# Firestore Security Rules
resource "google_firebaserules_ruleset" "firestore" {
  project = var.project_id

  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/rules/firestore.rules")
    }
  }

  depends_on = [google_firestore_database.database]
}

# Deploy the security rules to Firestore
resource "google_firebaserules_release" "firestore" {
  project      = var.project_id
  name         = "cloud.firestore"
  ruleset_name = google_firebaserules_ruleset.firestore.name

  depends_on = [google_firebaserules_ruleset.firestore]
}
