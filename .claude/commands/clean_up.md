# Clean up test data

Delete all test data from Firestore and Cloud Storage.

## Steps

1. Run the cleanup script:
   ```bash
   python scripts/cleanup_test_data.py
   ```

2. The script will show:
   - Document counts for `images`, `users`, `events` collections
   - Object count in Cloud Storage bucket
   - Total items to be deleted

3. Type `DELETE` to confirm deletion (or anything else to cancel)

4. Verify cleanup by running the script again (should show "No data to delete")

## What gets deleted

- Firestore: `images`, `users`, `events` collections
- Cloud Storage: All objects in `wedding-smile-images-wedding-smile-catcher` bucket

## What is preserved

- Firestore: `accounts` collection (operator accounts)
