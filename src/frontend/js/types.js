/**
 * JSDoc type definitions for Firestore documents.
 * Import this file for type annotations: `@import("./types.js")`
 *
 * These are documentation-only types (no runtime code).
 */

/**
 * @typedef {Object} ImageDoc
 * @property {string} id - Firestore document ID
 * @property {string} user_id - LINE user ID
 * @property {string} [user_name] - Denormalized user display name
 * @property {string} event_id - Associated event ID
 * @property {number} [total_score] - Combined score (smile * AI / 100 * penalty)
 * @property {number} [smile_score] - Sum of joy likelihood scores from Vision API
 * @property {number} [ai_score] - Vertex AI theme evaluation score (0-100)
 * @property {string} [ai_comment] - AI-generated comment
 * @property {string} [comment] - Legacy comment field
 * @property {string} [gemini_comment] - Legacy Gemini comment field
 * @property {string} [storage_url] - Signed GCS URL for the image
 * @property {string} status - Processing status (e.g. "scored", "pending")
 * @property {import("firebase/firestore").Timestamp} [upload_timestamp]
 * @property {import("firebase/firestore").Timestamp} [deleted_at] - Soft-delete timestamp
 */

/**
 * @typedef {Object} UserDoc
 * @property {string} id - Firestore document ID (LINE user ID)
 * @property {string} name - User display name
 * @property {string} event_id - Associated event ID
 * @property {number} total_uploads - Number of images uploaded
 * @property {number} [best_score] - Best total_score achieved
 * @property {import("firebase/firestore").Timestamp} [created_at]
 * @property {import("firebase/firestore").Timestamp} [deleted_at]
 */

/**
 * @typedef {Object} EventDoc
 * @property {string} id - Firestore document ID
 * @property {string} event_name - Display name
 * @property {string} event_date - ISO date string (YYYY-MM-DD)
 * @property {string} event_code - UUID for QR code / join link
 * @property {string} account_id - Owner account UID
 * @property {"draft"|"active"|"archived"} status
 * @property {string} [theme] - UI theme name
 * @property {Object} [settings] - Event-specific settings
 * @property {string} [settings.theme] - Scoring theme description
 * @property {number} [settings.max_uploads_per_user]
 * @property {number} [settings.similarity_threshold]
 * @property {number} [settings.similarity_penalty]
 * @property {string} [application_id] - Linked application ID
 * @property {string} [start_time]
 * @property {string} [end_time]
 * @property {string} [guest_count]
 * @property {string} [venue_name]
 * @property {import("firebase/firestore").Timestamp} [created_at]
 * @property {import("firebase/firestore").Timestamp} [notification_sent_at]
 * @property {number} [notification_sent_count]
 * @property {number} [notification_failed_count]
 */

/**
 * @typedef {Object} ApplicationDoc
 * @property {string} id - Firestore document ID
 * @property {string} groom_name
 * @property {string} bride_name
 * @property {string} email
 * @property {string} event_date
 * @property {string} start_time
 * @property {string} end_time
 * @property {string} guest_count
 * @property {string} [venue_name]
 * @property {string} [referral_source]
 * @property {string} [questions]
 * @property {"pending"|"event_created"|"rejected"} status
 * @property {string} [event_id] - Created event ID (if status is event_created)
 * @property {import("firebase/firestore").Timestamp} [created_at]
 */

/**
 * @typedef {Object} AccountDoc
 * @property {string} id - Firestore document ID (Firebase Auth UID)
 * @property {string} email
 * @property {string} [display_name]
 * @property {boolean} [is_admin] - Operator flag
 * @property {"active"|"suspended"} [status]
 * @property {import("firebase/firestore").Timestamp} [created_at]
 * @property {import("firebase/firestore").Timestamp} [terms_accepted_at]
 */
