# Secret Manager Module
# Manages LINE Bot credentials securely

# LINE Channel Secret
resource "google_secret_manager_secret" "line_channel_secret" {
  project   = var.project_id
  secret_id = "line-channel-secret"

  replication {
    auto {}
  }

  labels = var.labels
}

resource "google_secret_manager_secret_version" "line_channel_secret" {
  secret      = google_secret_manager_secret.line_channel_secret.id
  secret_data = var.line_channel_secret

  lifecycle {
    ignore_changes = [secret_data]
  }
}

# LINE Channel Access Token
resource "google_secret_manager_secret" "line_channel_access_token" {
  project   = var.project_id
  secret_id = "line-channel-access-token"

  replication {
    auto {}
  }

  labels = var.labels
}

resource "google_secret_manager_secret_version" "line_channel_access_token" {
  secret      = google_secret_manager_secret.line_channel_access_token.id
  secret_data = var.line_channel_access_token

  lifecycle {
    ignore_changes = [secret_data]
  }
}
