# Cloud Storage bucket for wedding smile images
resource "google_storage_bucket" "images" {
  name          = var.bucket_name
  location      = var.region
  force_destroy = var.force_destroy

  uniform_bucket_level_access = true

  # CORS configuration for frontend access
  cors {
    origin          = var.cors_origins
    method          = ["GET", "HEAD", "PUT", "POST"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  # Lifecycle management (optional: auto-delete old images)
  dynamic "lifecycle_rule" {
    for_each = var.lifecycle_age_days > 0 ? [1] : []
    content {
      condition {
        age = var.lifecycle_age_days
      }
      action {
        type = "Delete"
      }
    }
  }

  # Versioning (optional: keep old versions)
  versioning {
    enabled = var.versioning_enabled
  }

  # Labels for resource organization
  labels = var.labels
}

# Make bucket publicly readable (for displaying images)
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.images.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
