# Project Information
# Basic GCP project configuration outputs
# Testing workflow fix for apply skip logic
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

# Future outputs (commented out for now)
# These outputs will be enabled when respective modules are implemented:
#
# output "storage_bucket_name" {
#   description = "Cloud Storage bucket name"
#   value       = module.storage.bucket_name
# }
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
