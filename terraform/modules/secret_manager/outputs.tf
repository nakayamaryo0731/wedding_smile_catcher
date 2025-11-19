output "line_channel_secret_id" {
  description = "LINE Channel Secret ID"
  value       = google_secret_manager_secret.line_channel_secret.id
}

output "line_channel_access_token_id" {
  description = "LINE Channel Access Token ID"
  value       = google_secret_manager_secret.line_channel_access_token.id
}

output "secret_names" {
  description = "List of secret names"
  value = [
    google_secret_manager_secret.line_channel_secret.secret_id,
    google_secret_manager_secret.line_channel_access_token.secret_id,
  ]
}
