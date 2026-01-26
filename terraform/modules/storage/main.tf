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

# Public read access for image objects
# TODO: Replace with signed URLs (release-todo.md #5.2)
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.images.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Grant Terraform service account permission to manage objects
# This is needed for Cloud Functions deployment (uploading source code)
resource "google_storage_bucket_iam_member" "terraform_object_admin" {
  bucket = google_storage_bucket.images.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:terraform-github-actions@${var.project_id}.iam.gserviceaccount.com"
}
