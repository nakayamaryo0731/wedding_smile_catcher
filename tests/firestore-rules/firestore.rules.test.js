/**
 * Firestore Security Rules Tests
 *
 * Tests for Wedding Smile Catcher Firestore security rules.
 * Run with: npm run test:emulator (from tests/firestore-rules directory)
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let testEnv;

// Test user IDs
const ADMIN_UID = "admin-user-123";
const OWNER_UID = "owner-user-456";
const OTHER_UID = "other-user-789";
const EVENT_ID = "event-abc123";

beforeAll(async () => {
  const rulesPath = resolve(__dirname, "../../firestore.rules");
  const rules = readFileSync(rulesPath, "utf8");

  // emulators:exec sets FIRESTORE_EMULATOR_HOST; fall back to the default port
  const [host, port] = (
    process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080"
  ).split(":");

  testEnv = await initializeTestEnvironment({
    projectId: "wedding-smile-catcher-test",
    firestore: {
      rules,
      host,
      port: Number(port),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // Setup test data
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // Create admin account
    await setDoc(doc(db, "accounts", ADMIN_UID), {
      email: "admin@example.com",
      is_admin: true,
      created_at: new Date(),
    });

    // Create regular account (event owner)
    await setDoc(doc(db, "accounts", OWNER_UID), {
      email: "owner@example.com",
      is_admin: false,
      created_at: new Date(),
    });

    // Create event owned by OWNER_UID
    await setDoc(doc(db, "events", EVENT_ID), {
      account_id: OWNER_UID,
      event_name: "Test Wedding",
      event_code: "test-code-123",
      status: "active",
      created_at: new Date(),
    });

    // Create user (LINE user) for the event
    await setDoc(doc(db, "users", `lineuser123_${EVENT_ID}`), {
      line_user_id: "lineuser123",
      event_id: EVENT_ID,
      name: "Test Guest",
      join_status: "registered",
      created_at: new Date(),
    });

    // Create image for the event
    await setDoc(doc(db, "images", "image-123"), {
      event_id: EVENT_ID,
      user_id: "lineuser123",
      user_name: "Test Guest",
      status: "completed",
      total_score: 85,
      created_at: new Date(),
    });
  });
});

describe("Accounts Collection", () => {
  test("authenticated user can read their own account", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, "accounts", OWNER_UID)));
  });

  test("authenticated user cannot read other user's account", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(getDoc(doc(db, "accounts", OWNER_UID)));
  });

  test("admin can read any account", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(db, "accounts", OWNER_UID)));
  });

  test("authenticated user can create their own account with sign-up fields", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "accounts", OTHER_UID), {
        email: "other@example.com",
        display_name: "Other",
        created_at: new Date(),
        terms_accepted_at: new Date(),
        status: "active",
      })
    );
  });

  test("user cannot create their own account with is_admin", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      setDoc(doc(db, "accounts", OTHER_UID), {
        email: "other@example.com",
        display_name: "Other",
        created_at: new Date(),
        is_admin: true,
      })
    );
  });

  test("user cannot create their own account with unknown fields", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      setDoc(doc(db, "accounts", OTHER_UID), {
        email: "other@example.com",
        role: "admin",
      })
    );
  });

  test("user can update their own display_name", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "accounts", OWNER_UID), { display_name: "New Name" })
    );
  });

  test("user cannot grant themselves is_admin", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, "accounts", OWNER_UID), { is_admin: true })
    );
  });

  test("user cannot update is_admin together with display_name", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, "accounts", OWNER_UID), {
        display_name: "New Name",
        is_admin: true,
      })
    );
  });

  test("user cannot change their own status", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, "accounts", OWNER_UID), { status: "active" })
    );
  });

  test("user cannot update another user's account", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, "accounts", OWNER_UID), { display_name: "Hacked" })
    );
  });

  test("admin can grant is_admin to another account", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "accounts", OWNER_UID), { is_admin: true })
    );
  });

  test("user cannot create account for another user", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(db, "accounts", "someone-else"), {
        email: "fake@example.com",
        is_admin: false,
      })
    );
  });

  test("unauthenticated user cannot read accounts", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "accounts", OWNER_UID)));
  });

  test("accounts cannot be deleted", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(deleteDoc(doc(db, "accounts", OWNER_UID)));
  });
});

describe("Events Collection", () => {
  test("anyone can read a single event (for ranking UI)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "events", EVENT_ID)));
  });

  test("unauthenticated user cannot list events", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, "events")));
  });

  test("non-admin user cannot list events", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(getDocs(collection(db, "events")));
  });

  test("admin can list events", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDocs(collection(db, "events")));
  });

  test("admin can create event with their account_id", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "events", "new-event"), {
        account_id: ADMIN_UID,
        event_name: "New Wedding",
        event_code: "new-code-456",
        status: "draft",
        created_at: new Date(),
      })
    );
  });

  test("non-admin user cannot create event even with their account_id", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(db, "events", "new-event"), {
        account_id: OWNER_UID,
        event_name: "New Wedding",
        event_code: "new-code-456",
        status: "draft",
        created_at: new Date(),
      })
    );
  });

  test("admin cannot create event with different account_id", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      setDoc(doc(db, "events", "fake-event"), {
        account_id: OTHER_UID,
        event_name: "Fake Event",
        status: "draft",
      })
    );
  });

  test("event owner can update their event", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "events", EVENT_ID), {
        status: "archived",
      })
    );
  });

  test("non-owner cannot update event", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, "events", EVENT_ID), {
        status: "archived",
      })
    );
  });

  test("admin can update any event", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "events", EVENT_ID), {
        status: "archived",
      })
    );
  });

  test("event owner can delete their event", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, "events", EVENT_ID)));
  });

  test("non-owner cannot delete event", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(deleteDoc(doc(db, "events", EVENT_ID)));
  });

  test("unauthenticated user can update theme only (ranking page)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      updateDoc(doc(db, "events", EVENT_ID), {
        theme: "ocean-blue",
      })
    );
  });

  test("unauthenticated user can update event_name (ranking page)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      updateDoc(doc(db, "events", EVENT_ID), {
        event_name: "Renamed Wedding",
      })
    );
  });

  test("unauthenticated user can update theme and event_name together", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      updateDoc(doc(db, "events", EVENT_ID), {
        theme: "ocean-blue",
        event_name: "Renamed Wedding",
      })
    );
  });

  test("unauthenticated user cannot update event_name with other fields", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      updateDoc(doc(db, "events", EVENT_ID), {
        event_name: "Renamed Wedding",
        status: "archived",
      })
    );
  });

  test("unauthenticated user cannot set empty event_name", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      updateDoc(doc(db, "events", EVENT_ID), {
        event_name: "",
      })
    );
  });

  test("unauthenticated user cannot set event_name over 100 chars", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      updateDoc(doc(db, "events", EVENT_ID), {
        event_name: "a".repeat(101),
      })
    );
  });

  test("unauthenticated user cannot set non-string event_name", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      updateDoc(doc(db, "events", EVENT_ID), {
        event_name: 12345,
      })
    );
  });
});

describe("Users Collection (LINE Users)", () => {
  test("anyone can read users (for ranking display)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "users", `lineuser123_${EVENT_ID}`)));
  });

  test("frontend cannot create users", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(db, "users", "new-user"), {
        line_user_id: "newuser",
        event_id: EVENT_ID,
        name: "New User",
      })
    );
  });

  test("event owner can update users in their event (soft delete)", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "users", `lineuser123_${EVENT_ID}`), {
        deleted_at: new Date(),
      })
    );
  });

  test("non-owner cannot update users", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, "users", `lineuser123_${EVENT_ID}`), {
        deleted_at: new Date(),
      })
    );
  });

  test("admin can update any user", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "users", `lineuser123_${EVENT_ID}`), {
        deleted_at: new Date(),
      })
    );
  });

  test("only admin can delete users", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(deleteDoc(doc(ownerDb, "users", `lineuser123_${EVENT_ID}`)));

    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(deleteDoc(doc(adminDb, "users", `lineuser123_${EVENT_ID}`)));
  });
});

describe("Images Collection", () => {
  test("anyone can read images (for ranking display)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "images", "image-123")));
  });

  test("frontend cannot create images", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(db, "images", "new-image"), {
        event_id: EVENT_ID,
        user_id: "lineuser123",
        status: "pending",
      })
    );
  });

  test("event owner can update images in their event (soft delete)", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "images", "image-123"), {
        deleted_at: new Date(),
      })
    );
  });

  test("unauthenticated user can soft delete images (deleted_at only)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      updateDoc(doc(db, "images", "image-123"), {
        deleted_at: new Date(),
      })
    );
  });

  test("unauthenticated user cannot update other fields", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      updateDoc(doc(db, "images", "image-123"), {
        status: "deleted",
      })
    );
  });

  test("unauthenticated user cannot update deleted_at with other fields", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      updateDoc(doc(db, "images", "image-123"), {
        deleted_at: new Date(),
        status: "deleted",
      })
    );
  });

  test("non-owner authenticated user can soft delete images (deleted_at only)", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "images", "image-123"), {
        deleted_at: new Date(),
      })
    );
  });

  test("non-owner authenticated user cannot update other fields", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, "images", "image-123"), {
        status: "deleted",
      })
    );
  });

  test("admin can update any image", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "images", "image-123"), {
        deleted_at: new Date(),
      })
    );
  });

  test("only admin can delete images", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(deleteDoc(doc(ownerDb, "images", "image-123")));

    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(deleteDoc(doc(adminDb, "images", "image-123")));
  });
});

describe("Applications Collection", () => {
  const APPLICATION_ID = "abcdefghij0123456789";

  // Mirrors getFormData() in src/frontend/js/apply.js
  function validApplication(overrides = {}) {
    return {
      groom_name: "太郎",
      bride_name: "花子",
      email: "couple@example.com",
      event_date: "2026-12-01",
      start_time: "14:00",
      end_time: "17:00",
      guest_count: "51~100人",
      venue_name: "テストホテル",
      referral_source: "ネット検索",
      questions: "",
      status: "pending",
      event_id: null,
      created_at: serverTimestamp(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "applications", APPLICATION_ID), {
        ...validApplication(),
        created_at: new Date(),
      });
    });
  });

  test("unauthenticated user can submit a valid application", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(addDoc(collection(db, "applications"), validApplication()));
  });

  test("unauthenticated user can submit with optional fields empty", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      addDoc(
        collection(db, "applications"),
        validApplication({ venue_name: "", referral_source: "", questions: "" })
      )
    );
  });

  test("application cannot use a custom document ID", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, "applications", "custom-id"), validApplication())
    );
  });

  test("application cannot include unknown fields", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, "applications"), validApplication({ note: "extra" }))
    );
  });

  test("application cannot omit form fields", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const data = validApplication();
    delete data.questions;
    await assertFails(addDoc(collection(db, "applications"), data));
  });

  test("application status must be pending", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, "applications"), validApplication({ status: "event_created" }))
    );
  });

  test("application cannot set event_id", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, "applications"), validApplication({ event_id: "event-1" }))
    );
  });

  test("application names must be 1-50 chars", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, "applications"), validApplication({ groom_name: "" }))
    );
    await assertFails(
      addDoc(collection(db, "applications"), validApplication({ bride_name: "a".repeat(51) }))
    );
  });

  test("application questions must be at most 1000 chars", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, "applications"), validApplication({ questions: "a".repeat(1001) }))
    );
  });

  test("application select fields must be one of the form options", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, "applications"), validApplication({ guest_count: "1000人" }))
    );
    await assertFails(
      addDoc(collection(db, "applications"), validApplication({ referral_source: "other" }))
    );
  });

  test("application date and times must match the form format", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, "applications"), validApplication({ event_date: "2026/12/01" }))
    );
    await assertFails(
      addDoc(collection(db, "applications"), validApplication({ start_time: "2pm" }))
    );
  });

  test("application created_at must be the server timestamp", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, "applications"), validApplication({ created_at: new Date() }))
    );
  });

  test("only admin can read applications", async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, "applications", APPLICATION_ID)));

    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(getDoc(doc(ownerDb, "applications", APPLICATION_ID)));

    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(adminDb, "applications", APPLICATION_ID)));
  });

  test("only admin can update applications", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      updateDoc(doc(ownerDb, "applications", APPLICATION_ID), { status: "rejected" })
    );

    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, "applications", APPLICATION_ID), {
        status: "event_created",
        event_id: EVENT_ID,
      })
    );
  });
});

describe("Default Deny", () => {
  test("unknown collection is denied", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(getDoc(doc(db, "unknown_collection", "doc-123")));
  });
});
