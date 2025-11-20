# Wedding Smile Catcher - Terraform Configuration
# This file orchestrates all infrastructure modules

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "firestore.googleapis.com",
    "iam.googleapis.com",
    "vision.googleapis.com",
    "aiplatform.googleapis.com",
    "cloudfunctions.googleapis.com",
    "cloudbuild.googleapis.com",
    # Uncomment as modules are implemented:
    # "run.googleapis.com",
    # "logging.googleapis.com",
    # "monitoring.googleapis.com",
  ])

  project = var.project_id
  service = each.value

  disable_on_destroy = false
}

# Secret Manager Module - LINE Bot Credentials
module "secret_manager" {
  source = "./modules/secret_manager"

  project_id = var.project_id

  line_channel_secret       = var.line_channel_secret
  line_channel_access_token = var.line_channel_access_token

  labels = var.labels

  depends_on = [google_project_service.required_apis]
}

# Cloud Storage Module - Image Storage
# Stores wedding smile images with public read access
module "storage" {
  source = "./modules/storage"

  bucket_name = var.storage_bucket_name
  region      = var.region

  # Allow bucket deletion for development (change to false for production)
  force_destroy = true

  # CORS configuration for frontend access
  cors_origins = ["*"] # TODO: Restrict to actual frontend domain in production

  # Lifecycle management (disabled for now)
  lifecycle_age_days = 0

  # Versioning (disabled for now)
  versioning_enabled = false

  labels = var.labels

  depends_on = [google_project_service.required_apis]
}

# Firestore Module - Database for users, images, and rankings
module "firestore" {
  source = "./modules/firestore"

  project_id  = var.project_id
  location_id = var.firestore_location

  # Use default database name
  database_name = "(default)"

  # Development settings (adjust for production)
  deletion_policy                = "DELETE"
  point_in_time_recovery_enabled = false

  depends_on = [google_project_service.required_apis]
}

# IAM Module - Service accounts and permissions for Cloud Functions
module "iam" {
  source = "./modules/iam"

  project_id          = var.project_id
  storage_bucket_name = var.storage_bucket_name

  depends_on = [
    google_project_service.required_apis,
    module.storage
  ]
}

# Cloud Functions Module - Webhook and Scoring functions
module "functions" {
  source = "./modules/functions"

  project_id          = var.project_id
  region              = var.region
  storage_bucket_name = var.storage_bucket_name

  webhook_service_account_email = module.iam.webhook_service_account_email
  scoring_service_account_email = module.iam.scoring_service_account_email

  line_channel_secret_name       = "line-channel-secret"
  line_channel_access_token_name = "line-channel-access-token"

  depends_on = [
    google_project_service.required_apis,
    module.iam,
    module.secret_manager,
    module.storage
  ]
}

# Future modules (commented out for now):
#
# module "cloud_run" {
#   source = "./modules/cloud_run"
#   ...
# }
