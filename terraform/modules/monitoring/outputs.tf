# Monitoring Module Outputs

output "notification_channel_id" {
  description = "ID of the email notification channel"
  value       = google_monitoring_notification_channel.email.id
}

output "webhook_errors_alert_policy_id" {
  description = "ID of the webhook errors alert policy"
  value       = google_monitoring_alert_policy.webhook_errors.id
}

output "scoring_errors_alert_policy_id" {
  description = "ID of the scoring errors alert policy"
  value       = google_monitoring_alert_policy.scoring_errors.id
}

output "webhook_latency_alert_policy_id" {
  description = "ID of the webhook latency alert policy"
  value       = google_monitoring_alert_policy.webhook_latency.id
}

output "scoring_latency_alert_policy_id" {
  description = "ID of the scoring latency alert policy"
  value       = google_monitoring_alert_policy.scoring_latency.id
}
