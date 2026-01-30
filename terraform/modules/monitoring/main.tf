# Cloud Monitoring Configuration
# Alerts for Cloud Functions errors and latency

# Email notification channel
resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "Wedding Smile Catcher Alerts"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

# Alert: Webhook function errors
resource "google_monitoring_alert_policy" "webhook_errors" {
  project      = var.project_id
  display_name = "Webhook Function Errors"
  combiner     = "OR"

  conditions {
    display_name = "Webhook error rate > 5%"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_function"
        AND resource.labels.function_name = "${var.webhook_function_name}"
        AND metric.type = "cloudfunctions.googleapis.com/function/execution_count"
        AND metric.labels.status != "ok"
      EOT

      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Webhook Cloud Function is experiencing errors. Check Cloud Functions logs for details."
    mime_type = "text/markdown"
  }
}

# Alert: Scoring function errors
resource "google_monitoring_alert_policy" "scoring_errors" {
  project      = var.project_id
  display_name = "Scoring Function Errors"
  combiner     = "OR"

  conditions {
    display_name = "Scoring error rate > 5%"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_function"
        AND resource.labels.function_name = "${var.scoring_function_name}"
        AND metric.type = "cloudfunctions.googleapis.com/function/execution_count"
        AND metric.labels.status != "ok"
      EOT

      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Scoring Cloud Function is experiencing errors. Check Cloud Functions logs for details."
    mime_type = "text/markdown"
  }
}

# Alert: Webhook function high latency
resource "google_monitoring_alert_policy" "webhook_latency" {
  project      = var.project_id
  display_name = "Webhook Function High Latency"
  combiner     = "OR"

  conditions {
    display_name = "Webhook latency > 10s (p95)"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_function"
        AND resource.labels.function_name = "${var.webhook_function_name}"
        AND metric.type = "cloudfunctions.googleapis.com/function/execution_times"
      EOT

      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 10000000000 # 10 seconds in nanoseconds

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Webhook function latency is high. This may affect user experience."
    mime_type = "text/markdown"
  }
}

# Alert: Scoring function high latency
resource "google_monitoring_alert_policy" "scoring_latency" {
  project      = var.project_id
  display_name = "Scoring Function High Latency"
  combiner     = "OR"

  conditions {
    display_name = "Scoring latency > 30s (p95)"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_function"
        AND resource.labels.function_name = "${var.scoring_function_name}"
        AND metric.type = "cloudfunctions.googleapis.com/function/execution_times"
      EOT

      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 30000000000 # 30 seconds in nanoseconds

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Scoring function latency is high. AI processing may be slow."
    mime_type = "text/markdown"
  }
}
