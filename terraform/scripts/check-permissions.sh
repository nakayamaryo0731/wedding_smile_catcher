#!/bin/bash
# Check if terraform service account has all required IAM roles
# Usage: ./scripts/check-permissions.sh

set -e

PROJECT_ID="wedding-smile-catcher"
SA_EMAIL="terraform-github-actions@${PROJECT_ID}.iam.gserviceaccount.com"

# Required roles for current modules
REQUIRED_ROLES=(
  "roles/editor"
  "roles/datastore.owner"
  "roles/secretmanager.secretAccessor"
  "roles/iam.securityAdmin"
)

echo "Checking IAM roles for ${SA_EMAIL}..."
echo ""

# Get current roles
CURRENT_ROLES=$(gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:${SA_EMAIL}" \
  --format="value(bindings.role)")

# Check each required role
MISSING_ROLES=()
for role in "${REQUIRED_ROLES[@]}"; do
  if echo "$CURRENT_ROLES" | grep -q "^${role}$"; then
    echo "✅ ${role}"
  else
    echo "❌ ${role} (MISSING)"
    MISSING_ROLES+=("$role")
  fi
done

echo ""

if [ ${#MISSING_ROLES[@]} -eq 0 ]; then
  echo "✅ All required IAM roles are granted"
  exit 0
else
  echo "❌ Missing ${#MISSING_ROLES[@]} required role(s)"
  echo ""
  echo "To grant missing roles, run:"
  for role in "${MISSING_ROLES[@]}"; do
    echo "  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
    echo "    --member=\"serviceAccount:${SA_EMAIL}\" \\"
    echo "    --role=\"${role}\""
  done
  exit 1
fi
