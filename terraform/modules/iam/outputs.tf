output "webhook_service_account_email" {
  description = "Email address of the webhook function service account"
  value       = google_service_account.webhook_function.email
}

output "webhook_service_account_id" {
  description = "ID of the webhook function service account"
  value       = google_service_account.webhook_function.id
}

output "scoring_service_account_email" {
  description = "Email address of the scoring function service account"
  value       = google_service_account.scoring_function.email
}

output "scoring_service_account_id" {
  description = "ID of the scoring function service account"
  value       = google_service_account.scoring_function.id
}
