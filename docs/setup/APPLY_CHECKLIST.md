# Terraform Apply Checklist

Use this checklist before running `terraform apply` to avoid common issues and ensure smooth deployment.

## Pre-Apply Checks

### 1. Code Quality
- [ ] `terraform fmt -recursive` passed (no formatting issues)
- [ ] `terraform validate` passed (configuration is valid)
- [ ] Code has been reviewed (by yourself or team member)

### 2. Planning
- [ ] `terraform plan` executed successfully
- [ ] Plan output has been reviewed carefully
- [ ] Expected resources match the plan (no surprises)
- [ ] No unexpected deletions or replacements

### 3. Permissions & Authentication
- [ ] Currently authenticated with correct GCP account
  ```bash
  gcloud auth list
  gcloud config get-value project
  ```
- [ ] Service account has all required IAM roles (see [terraform/README.md](../../terraform/README.md#required-iam-roles))
- [ ] Required APIs are enabled in GCP project
  ```bash
  gcloud services list --enabled
  ```

### 4. State Management
- [ ] Terraform state is up-to-date (`terraform refresh` if needed)
- [ ] No state lock conflicts
- [ ] State backend is accessible (GCS bucket exists and is accessible)

### 5. Resource Dependencies
- [ ] Existing resources have been imported if necessary
  ```bash
  # Check if resources already exist in GCP
  # Import if needed before applying
  ```
- [ ] No resource naming conflicts
- [ ] Dependencies between resources are correctly defined

### 6. Configuration Files
- [ ] `terraform.tfvars` is properly configured
- [ ] No unused variables (check for warnings)
- [ ] Secrets are stored in Secret Manager (not in terraform.tfvars committed to git)
- [ ] Variable values are appropriate for the target environment

### 7. Environment Verification
- [ ] Correct environment (dev/staging/production)
- [ ] Correct GCP project selected
- [ ] Terraform workspace is correct (if using workspaces)

## During Apply

### Safety Measures
- [ ] Review the plan one more time when prompted
- [ ] Type `yes` only after careful review (not `terraform apply -auto-approve`)
- [ ] Monitor the apply output for errors
- [ ] Be ready to interrupt with Ctrl+C if something goes wrong

### Error Handling
If errors occur during apply:
1. **Don't panic** - partial applies are recoverable
2. **Read the error message carefully**
3. **Check common issues**:
   - Permission denied → Add required IAM role
   - Resource already exists → Import the resource
   - API not enabled → Enable the required API
   - State lock → Wait or force-unlock if necessary
4. **Fix the issue** and re-run `terraform apply`

## Post-Apply Verification

### 1. Verify Resources Created
- [ ] Check GCP Console for created resources
- [ ] Verify resource configurations match expectations
- [ ] Test resource functionality (if applicable)

### 2. Outputs
- [ ] Review terraform outputs
  ```bash
  terraform output
  ```
- [ ] Save important outputs for future reference

### 3. State Verification
- [ ] State file updated successfully
- [ ] No state drift detected
  ```bash
  terraform plan  # Should show "No changes"
  ```

### 4. Documentation
- [ ] Update related documentation if infrastructure changed significantly
- [ ] Document any manual steps performed
- [ ] Update [TERRAFORM_SETUP_PROGRESS.md](./TERRAFORM_SETUP_PROGRESS.md) if applicable

### 5. Cleanup
- [ ] Remove temporary files (if any)
- [ ] Clear sensitive data from terminal history (if any secrets were displayed)

## Common Issues & Solutions

### Permission Denied (403)
**Problem:** Service account lacks required IAM role  
**Solution:** Grant the necessary role:
```bash
gcloud projects add-iam-policy-binding wedding-smile-catcher \
  --member="serviceAccount:terraform-github-actions@wedding-smile-catcher.iam.gserviceaccount.com" \
  --role="roles/REQUIRED_ROLE"
```

### Resource Already Exists (409)
**Problem:** Resource exists in GCP but not in Terraform state  
**Solution:** Import the resource:
```bash
terraform import <resource_address> <resource_id>
# Example:
terraform import module.firestore.google_firestore_database.database \
  "projects/wedding-smile-catcher/databases/(default)"
```

### API Not Enabled
**Problem:** Required API is not enabled  
**Solution:** Enable the API:
```bash
gcloud services enable <api-name>.googleapis.com
# Example:
gcloud services enable firestore.googleapis.com
```

### State Lock Conflict
**Problem:** Another terraform operation is in progress  
**Solution:** 
1. Wait for other operation to complete
2. If operation is stuck, force unlock (use with caution):
   ```bash
   terraform force-unlock <LOCK_ID>
   ```

## Rollback Plan

If apply fails and causes issues:

1. **Identify what was created**:
   ```bash
   terraform state list
   ```

2. **Review state changes**:
   ```bash
   git diff terraform.tfstate  # If using local state
   ```

3. **Options for rollback**:
   - **Option A:** Fix the issue and re-apply
   - **Option B:** Remove problematic resources from state:
     ```bash
     terraform state rm <resource_address>
     ```
   - **Option C:** Manually delete resources from GCP Console (last resort)

4. **Verify state consistency**:
   ```bash
   terraform plan  # Check for drift
   ```

## Additional Notes

- **Never** use `-auto-approve` in production
- **Always** review the plan output before typing `yes`
- **Keep** a backup of terraform.tfstate (if using local state)
- **Test** in development environment first
- **Document** any manual interventions

## Quick Reference Commands

```bash
# Pre-apply checks
terraform fmt -recursive
terraform validate
terraform plan

# Authentication check
gcloud auth list
gcloud config get-value project

# Apply
terraform apply

# Post-apply verification
terraform output
terraform state list
terraform plan  # Should show "No changes"

# Troubleshooting
terraform refresh
terraform state list
terraform state show <resource_address>
```

## Related Documentation

- [Terraform README](../../terraform/README.md) - IAM roles and setup guide
- [GCP Setup Progress](./GCP_SETUP_PROGRESS.md) - GCP project setup status
- [Terraform Setup Progress](./TERRAFORM_SETUP_PROGRESS.md) - Infrastructure deployment status
