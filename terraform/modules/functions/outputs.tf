output "webhook_function_url" {
  description = "URL of the webhook Cloud Function"
  value       = google_cloudfunctions2_function.webhook.service_config[0].uri
}

output "scoring_function_url" {
  description = "URL of the scoring Cloud Function"
  value       = google_cloudfunctions2_function.scoring.service_config[0].uri
}

output "webhook_function_name" {
  description = "Name of the webhook Cloud Function"
  value       = google_cloudfunctions2_function.webhook.name
}

output "scoring_function_name" {
  description = "Name of the scoring Cloud Function"
  value       = google_cloudfunctions2_function.scoring.name
}

output "notification_function_url" {
  description = "URL of the notification Cloud Function"
  value       = google_cloudfunctions2_function.notification.service_config[0].uri
}

output "notification_function_name" {
  description = "Name of the notification Cloud Function"
  value       = google_cloudfunctions2_function.notification.name
}

output "liff_join_function_url" {
  description = "URL of the LIFF join Cloud Function"
  value       = google_cloudfunctions2_function.liff_join.service_config[0].uri
}

output "liff_join_function_name" {
  description = "Name of the LIFF join Cloud Function"
  value       = google_cloudfunctions2_function.liff_join.name
}
