# Wedding Smile Catcher - Terraform Configuration
# This file orchestrates all infrastructure modules

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "secretmanager.googleapis.com",
    # Uncomment as modules are implemented:
    # "cloudfunctions.googleapis.com",
    # "run.googleapis.com",
    # "cloudbuild.googleapis.com",
    # "vision.googleapis.com",
    # "aiplatform.googleapis.com",
    # "storage.googleapis.com",
    # "firestore.googleapis.com",
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
  region     = var.region

  line_channel_secret       = var.line_channel_secret
  line_channel_access_token = var.line_channel_access_token

  labels = var.labels

  depends_on = [google_project_service.required_apis]
}

# Future modules (commented out for now):
#
# module "iam" {
#   source = "./modules/iam"
#   ...
# }
#
# module "storage" {
#   source = "./modules/storage"
#   ...
# }
#
# module "firestore" {
#   source = "./modules/firestore"
#   ...
# }
#
# module "functions" {
#   source = "./modules/functions"
#   ...
# }
#
# module "cloud_run" {
#   source = "./modules/cloud_run"
#   ...
# }
