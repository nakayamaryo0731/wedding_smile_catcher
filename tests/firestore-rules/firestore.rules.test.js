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
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
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

  testEnv = await initializeTestEnvironment({
    projectId: "wedding-smile-catcher-test",
    firestore: {
      rules,
      host: "127.0.0.1",
      port: 8080,
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

  test("authenticated user can create their own account", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "accounts", OTHER_UID), {
        email: "other@example.com",
        is_admin: false,
        created_at: new Date(),
      })
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

  test("authenticated user can list events", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDocs(collection(db, "events")));
  });

  test("authenticated user can create event with their account_id", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "events", "new-event"), {
        account_id: OWNER_UID,
        event_name: "New Wedding",
        event_code: "new-code-456",
        status: "draft",
        created_at: new Date(),
      })
    );
  });

  test("user cannot create event with different account_id", async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
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

  test("unauthenticated user cannot update images", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      updateDoc(doc(db, "images", "image-123"), {
        deleted_at: new Date(),
      })
    );
  });

  test("non-owner authenticated user cannot update images", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
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

describe("Default Deny", () => {
  test("unknown collection is denied", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(getDoc(doc(db, "unknown_collection", "doc-123")));
  });
});
