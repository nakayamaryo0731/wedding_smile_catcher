# Service Accounts for Cloud Functions and Cloud Run

# Webhook Function Service Account
resource "google_service_account" "webhook_function" {
  account_id   = "webhook-function-sa"
  display_name = "Webhook Cloud Function Service Account"
  description  = "Service account for LINE Bot webhook function"
  project      = var.project_id
}

# Scoring Function Service Account
resource "google_service_account" "scoring_function" {
  account_id   = "scoring-function-sa"
  display_name = "Scoring Cloud Function Service Account"
  description  = "Service account for image scoring function"
  project      = var.project_id
}

# IAM Bindings for Webhook Function

# Firestore access for user registration
resource "google_project_iam_member" "webhook_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.webhook_function.email}"
}

# Storage bucket access for image upload
resource "google_storage_bucket_iam_member" "webhook_storage" {
  bucket = var.storage_bucket_name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.webhook_function.email}"
}

# Secret Manager access for LINE credentials
resource "google_project_iam_member" "webhook_secret_manager" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.webhook_function.email}"
}

# Cloud Functions invoker for triggering scoring function
resource "google_project_iam_member" "webhook_functions_invoker" {
  project = var.project_id
  role    = "roles/cloudfunctions.invoker"
  member  = "serviceAccount:${google_service_account.webhook_function.email}"
}

# Service Account Token Creator for signed URL generation (Webhook)
resource "google_service_account_iam_member" "webhook_token_creator" {
  service_account_id = google_service_account.webhook_function.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.webhook_function.email}"
}

# IAM Bindings for Scoring Function

# Firestore access for score storage
resource "google_project_iam_member" "scoring_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.scoring_function.email}"
}

# Storage bucket access for image reading
resource "google_storage_bucket_iam_member" "scoring_storage" {
  bucket = var.storage_bucket_name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.scoring_function.email}"
}

# Vertex AI access for Gemini evaluation
resource "google_project_iam_member" "scoring_vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.scoring_function.email}"
}

# Secret Manager access (if needed for API keys)
resource "google_project_iam_member" "scoring_secret_manager" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.scoring_function.email}"
}

# Service Account Token Creator for signed URL generation (Scoring)
resource "google_service_account_iam_member" "scoring_token_creator" {
  service_account_id = google_service_account.scoring_function.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.scoring_function.email}"
}
