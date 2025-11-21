# Cloud Functions Module
# Deploys webhook and scoring functions

# Generate timestamp for source code versioning
locals {
  timestamp = formatdate("YYYYMMDDhhmmss", timestamp())
}

# Create ZIP archives of function source code
data "archive_file" "webhook_source" {
  type        = "zip"
  source_dir  = "${path.root}/../src/functions/webhook"
  output_path = "${path.root}/.terraform/tmp/webhook-${local.timestamp}.zip"
  excludes    = [".env", "__pycache__", "*.pyc", ".DS_Store"]
}

data "archive_file" "scoring_source" {
  type        = "zip"
  source_dir  = "${path.root}/../src/functions/scoring"
  output_path = "${path.root}/.terraform/tmp/scoring-${local.timestamp}.zip"
  excludes    = [".env", "__pycache__", "*.pyc", ".DS_Store"]
}

# Upload webhook source to Cloud Storage
resource "google_storage_bucket_object" "webhook_source" {
  name   = "functions/webhook-${data.archive_file.webhook_source.output_md5}.zip"
  bucket = var.storage_bucket_name
  source = data.archive_file.webhook_source.output_path
}

# Upload scoring source to Cloud Storage
resource "google_storage_bucket_object" "scoring_source" {
  name   = "functions/scoring-${data.archive_file.scoring_source.output_md5}.zip"
  bucket = var.storage_bucket_name
  source = data.archive_file.scoring_source.output_path
}

# Webhook Cloud Function (Gen2)
resource "google_cloudfunctions2_function" "webhook" {
  name        = "webhook"
  location    = var.region
  description = "LINE Bot webhook handler"
  project     = var.project_id

  build_config {
    runtime     = "python311"
    entry_point = "webhook"

    source {
      storage_source {
        bucket = var.storage_bucket_name
        object = google_storage_bucket_object.webhook_source.name
      }
    }
  }

  service_config {
    max_instance_count    = 100
    min_instance_count    = 0
    available_memory      = "512M"
    timeout_seconds       = 60
    service_account_email = var.webhook_service_account_email

    environment_variables = {
      GCP_PROJECT_ID       = var.project_id
      STORAGE_BUCKET       = var.storage_bucket_name
      SCORING_FUNCTION_URL = "https://${var.region}-${var.project_id}.cloudfunctions.net/scoring"
    }

    secret_environment_variables {
      key        = "LINE_CHANNEL_SECRET"
      project_id = var.project_id
      secret     = var.line_channel_secret_name
      version    = "latest"
    }

    secret_environment_variables {
      key        = "LINE_CHANNEL_ACCESS_TOKEN"
      project_id = var.project_id
      secret     = var.line_channel_access_token_name
      version    = "latest"
    }
  }

  labels = {
    environment = "production"
    managed_by  = "terraform"
    function    = "webhook"
  }
}

# Scoring Cloud Function (Gen2)
resource "google_cloudfunctions2_function" "scoring" {
  name        = "scoring"
  location    = var.region
  description = "Image scoring handler (dummy implementation)"
  project     = var.project_id

  build_config {
    runtime     = "python311"
    entry_point = "scoring"

    source {
      storage_source {
        bucket = var.storage_bucket_name
        object = google_storage_bucket_object.scoring_source.name
      }
    }
  }

  service_config {
    max_instance_count    = 100
    min_instance_count    = 0
    available_memory      = "1Gi"
    timeout_seconds       = 300
    service_account_email = var.scoring_service_account_email

    environment_variables = {
      GCP_PROJECT_ID = var.project_id
    }

    secret_environment_variables {
      key        = "LINE_CHANNEL_ACCESS_TOKEN"
      project_id = var.project_id
      secret     = var.line_channel_access_token_name
      version    = "latest"
    }
  }

  labels = {
    environment = "production"
    managed_by  = "terraform"
    function    = "scoring"
  }
}

# Make webhook function publicly accessible
resource "google_cloudfunctions2_function_iam_member" "webhook_invoker" {
  project        = var.project_id
  location       = var.region
  cloud_function = google_cloudfunctions2_function.webhook.name
  role           = "roles/cloudfunctions.invoker"
  member         = "allUsers"
}

# Make underlying Cloud Run service publicly accessible
resource "google_cloud_run_service_iam_member" "webhook_run_invoker" {
  project  = var.project_id
  location = var.region
  service  = google_cloudfunctions2_function.webhook.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Allow webhook function to invoke scoring function
resource "google_cloudfunctions2_function_iam_member" "scoring_invoker" {
  project        = var.project_id
  location       = var.region
  cloud_function = google_cloudfunctions2_function.scoring.name
  role           = "roles/cloudfunctions.invoker"
  member         = "serviceAccount:${var.webhook_service_account_email}"
}

# Make underlying Cloud Run service accessible to webhook service account
resource "google_cloud_run_service_iam_member" "scoring_run_invoker" {
  project  = var.project_id
  location = var.region
  service  = google_cloudfunctions2_function.scoring.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.webhook_service_account_email}"
}
