# Project Configuration
output "project_id" {
  description = "GCP Project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP Region"
  value       = var.region
}

# Secret Manager
# Outputs for Secret Manager resources
output "secret_manager_secrets" {
  description = "Secret Manager secret names"
  value       = module.secret_manager.secret_names
}

output "line_channel_secret_id" {
  description = "LINE Channel Secret ID"
  value       = module.secret_manager.line_channel_secret_id
  sensitive   = true
}

output "line_channel_access_token_id" {
  description = "LINE Channel Access Token ID"
  value       = module.secret_manager.line_channel_access_token_id
  sensitive   = true
}

# Cloud Storage
# Outputs for Cloud Storage resources
output "storage_bucket_name" {
  description = "Cloud Storage bucket name"
  value       = module.storage.bucket_name
}

output "storage_bucket_url" {
  description = "Cloud Storage bucket URL"
  value       = module.storage.bucket_url
}

# Firestore
# Outputs for Firestore resources
output "firestore_database_name" {
  description = "Firestore database name"
  value       = module.firestore.database_name
}

output "firestore_database_location" {
  description = "Firestore database location"
  value       = module.firestore.database_location
}

# IAM
# Outputs for IAM service accounts
output "webhook_service_account_email" {
  description = "Email address of the webhook function service account"
  value       = module.iam.webhook_service_account_email
}

output "scoring_service_account_email" {
  description = "Email address of the scoring function service account"
  value       = module.iam.scoring_service_account_email
}

# Test Output (for CI/CD verification)
output "terraform_workspace" {
  description = "Current Terraform workspace"
  value       = terraform.workspace
}

# Future outputs (commented out for now)
# These outputs will be enabled when respective modules are implemented:
#
# output "webhook_function_url" {
#   description = "Webhook function URL"
#   value       = module.functions.webhook_url
# }
#
# output "frontend_url" {
#   description = "Frontend Cloud Run URL"
#   value       = module.cloud_run.frontend_url
# }
