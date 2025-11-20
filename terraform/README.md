# Terraform Infrastructure

This directory contains Terraform configurations for the Wedding Smile Catcher project infrastructure on Google Cloud Platform.

## Prerequisites

### Required Tools
- [Terraform](https://www.terraform.io/downloads) >= 1.0
- [gcloud CLI](https://cloud.google.com/sdk/docs/install)
- [GitHub CLI](https://cli.github.com/) (for CI/CD)

### GCP Project Setup
1. Create a GCP project: `wedding-smile-catcher`
2. Enable billing for the project
3. Install and configure gcloud CLI:
   ```bash
   gcloud auth login
   gcloud config set project wedding-smile-catcher
   ```

## Required IAM Roles

### Terraform Service Account (terraform-github-actions@wedding-smile-catcher.iam.gserviceaccount.com)

#### Current Requirements (Already Configured)
These roles are required for the currently implemented modules:

| Role | Purpose | Required By |
|------|---------|-------------|
| `roles/editor` | Basic resource management (Compute, Storage, APIs) | All modules |
| `roles/datastore.owner` | Firestore database creation and management | Firestore module |
| `roles/secretmanager.secretAccessor` | Access to Secret Manager secrets | Secret Manager module |
| `roles/iam.securityAdmin` | Manage IAM policies and service account permissions | IAM module |

#### Future Requirements (Not Yet Needed)
These roles will be required when implementing additional modules:

| Role | Purpose | Required When |
|------|---------|---------------|
| `roles/cloudfunctions.admin` | Deploy and manage Cloud Functions | Functions module |
| `roles/run.admin` | Deploy and manage Cloud Run services | Cloud Run module |
| `roles/iam.serviceAccountUser` | Impersonate service accounts | Functions/Cloud Run modules |
| `roles/logging.admin` | Configure logging | Logging module |
| `roles/monitoring.admin` | Configure monitoring | Monitoring module |

### Granting Permissions

To grant additional permissions to the Terraform service account:

```bash
# Example: Grant Cloud Functions admin role
gcloud projects add-iam-policy-binding wedding-smile-catcher \
  --member="serviceAccount:terraform-github-actions@wedding-smile-catcher.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.admin"
```

**Note:** The Terraform service account itself cannot be managed by Terraform (bootstrapping problem). Manual configuration is required for the service account's IAM roles.

### Checking Permissions

**IMPORTANT:** Always run the permission check script before `terraform apply` to avoid permission errors:

```bash
./scripts/check-permissions.sh
```

This script validates that the Terraform service account has all required IAM roles. If any roles are missing, it will display the exact commands needed to grant them.

## Project Structure

```
terraform/
├── main.tf              # Root module - orchestrates all resources
├── variables.tf         # Input variables with defaults
├── outputs.tf           # Output values
├── providers.tf         # Provider configuration
├── backend.tf           # State backend configuration
├── terraform.tfvars     # Variable values (gitignored - contains secrets)
└── modules/
    ├── secret_manager/  # LINE Bot credentials
    ├── storage/         # Image storage bucket
    ├── firestore/       # Database
    └── (future modules)
```

## Getting Started

### 1. Configure Variables

Create `terraform.tfvars` (this file is gitignored):

```hcl
# GCP Configuration
project_id = "wedding-smile-catcher"
region     = "asia-northeast1"

# LINE Bot Configuration (from LINE Developers Console)
line_channel_secret       = "your-channel-secret"
line_channel_access_token = "your-access-token"
```

**Important:** Never commit `terraform.tfvars` to version control. It contains secrets.

### 2. Initialize Terraform

```bash
cd terraform
terraform init
```

This will:
- Download required provider plugins
- Initialize the backend
- Initialize modules

### 3. Plan Changes

```bash
terraform plan
```

Review the planned changes carefully before applying.

### 4. Apply Changes

**Before running apply, see [Apply Checklist](../docs/setup/APPLY_CHECKLIST.md).**

```bash
terraform apply
```

Type `yes` to confirm the changes.

## CI/CD Workflow

### Pull Request Flow
1. Create a feature branch
2. Make terraform changes
3. Create a PR → CI runs `terraform plan`
4. Review the plan output in PR comments
5. Merge PR after approval

### Deployment Flow
- **Manual deployment only** (no auto-apply from CI)
- After PR merge, run `terraform apply` locally or from a secure environment
- State is stored in GCS (configured in `backend.tf`)

## Common Operations

### View Current State
```bash
terraform show
```

### List Resources
```bash
terraform state list
```

### Import Existing Resources
If a resource already exists in GCP but not in Terraform state:

```bash
# Example: Import Firestore database
terraform import module.firestore.google_firestore_database.database \
  "projects/wedding-smile-catcher/databases/(default)"
```

### Refresh State
```bash
terraform refresh
```

### Format Code
```bash
terraform fmt -recursive
```

### Validate Configuration
```bash
terraform validate
```

## Modules

### secret_manager
Manages LINE Bot credentials in Google Secret Manager.

**Outputs:**
- `secret_names`: List of secret names
- `line_channel_secret_id`: Secret Manager secret ID
- `line_channel_access_token_id`: Secret Manager secret ID

### storage
Manages Cloud Storage bucket for wedding smile images.

**Outputs:**
- `bucket_name`: Storage bucket name
- `bucket_url`: Storage bucket URL (gs://)

**Configuration:**
- Public read access enabled
- CORS configured for frontend access
- Lifecycle management (optional)
- Versioning (optional)

### firestore
Manages Firestore database for users, images, and rankings.

**Outputs:**
- `database_name`: Firestore database name
- `database_location`: Database location

**Configuration:**
- Database: `(default)`
- Location: `asia-northeast1`
- Type: `FIRESTORE_NATIVE`
- Deletion policy: `DELETE` (development mode)
- Point-in-time recovery: Disabled (development mode)

**Collections (created by application code):**
- `users`: User information (name, LINE user_id)
- `images`: Image metadata (scores, timestamps, user associations)
- `rankings`: Leaderboard data

## Troubleshooting

### Permission Denied Errors

If you see `Error 403: The caller does not have permission`:

1. Check which resource is causing the error
2. Identify the required IAM role (see [Required IAM Roles](#required-iam-roles))
3. Grant the role to the service account:
   ```bash
   gcloud projects add-iam-policy-binding wedding-smile-catcher \
     --member="serviceAccount:terraform-github-actions@wedding-smile-catcher.iam.gserviceaccount.com" \
     --role="roles/REQUIRED_ROLE"
   ```

### Resource Already Exists

If you see `Error 409: ... already exists`:

1. Import the existing resource:
   ```bash
   terraform import <resource_address> <resource_id>
   ```
2. Run `terraform plan` to verify the import
3. Run `terraform apply` to synchronize state

### State Lock Errors

If terraform operations hang or fail with state lock errors:

```bash
# List locks
gsutil ls gs://YOUR_STATE_BUCKET/.terraform.lock.info

# Force unlock (use with caution)
terraform force-unlock <LOCK_ID>
```

## Security Considerations

1. **Never commit secrets** to version control
   - `terraform.tfvars` is gitignored
   - Service account keys are gitignored
   - Use Secret Manager for sensitive data

2. **Service account permissions**
   - Follow principle of least privilege
   - Review IAM roles regularly
   - Use separate service accounts for different purposes

3. **State file security**
   - State files contain sensitive data
   - Store in GCS with encryption
   - Restrict access to state bucket

## Additional Resources

- [Terraform Google Provider Documentation](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [GCP Best Practices](https://cloud.google.com/docs/enterprise/best-practices-for-enterprise-organizations)
- [Project Documentation](../docs/)
