output "bucket_name" {
  description = "Name of the created storage bucket"
  value       = google_storage_bucket.images.name
}

output "bucket_url" {
  description = "URL of the storage bucket"
  value       = google_storage_bucket.images.url
}

output "bucket_self_link" {
  description = "Self link of the storage bucket"
  value       = google_storage_bucket.images.self_link
}
