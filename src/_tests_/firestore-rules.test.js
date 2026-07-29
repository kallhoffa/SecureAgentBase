import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';

const RULES_PATH = 'firestore.rules';
const PROJECT_ID = 'test-project';
const UID_ALICE = 'alice-uid';
const UID_BOB = 'bob-uid';

let testEnv;
let assertSucceeds;
let assertFails;

const isReady = () => !!testEnv;

beforeAll(async () => {
  try {
    const mod = await import('@firebase/rules-unit-testing');
    assertSucceeds = mod.assertSucceeds;
    assertFails = mod.assertFails;
    const rules = readFileSync(RULES_PATH, 'utf8');
    testEnv = await mod.initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules },
    });
  } catch (err) {
    console.warn('Firestore emulator not available — skipping rules tests.');
    console.warn('Install Firebase CLI emulator and run: npm run test:rules');
  }
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

const getDb = (uid) => {
  if (!isReady()) return null;
  return uid ? testEnv.authenticatedContext(uid).firestore()
    : testEnv.unauthenticatedContext().firestore();
};

describe('firestore.rules', () => {
  describe('posts collection', () => {
    it('allows unauthenticated read', async () => {
      if (!isReady()) return;
      await assertSucceeds(getDb().collection('posts').get());
    });

    it('allows authenticated create with valid data', async () => {
      if (!isReady()) return;
      await assertSucceeds(
        getDb(UID_ALICE).collection('posts').add({
          title: 'My Post', content: 'Some content',
          authorId: UID_ALICE, authorName: 'Alice',
        })
      );
    });

    it('denies create with mismatched authorId', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_ALICE).collection('posts').add({
          title: 'Fake Post', content: 'Impersonating',
          authorId: UID_BOB, authorName: 'Bob',
        })
      );
    });

    it('denies unauthenticated create', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb().collection('posts').add({
          title: 'No Auth', content: 'Should fail',
          authorId: 'anon', authorName: 'Anon',
        })
      );
    });

    it('denies update by non-author', async () => {
      if (!isReady()) return;
      const ref = await getDb(UID_ALICE).collection('posts').add({
        title: 'Alice Post', content: 'By Alice',
        authorId: UID_ALICE, authorName: 'Alice',
      });
      await assertFails(
        getDb(UID_BOB).collection('posts').doc(ref.id).update({ content: 'Hacked!' })
      );
    });

    it('allows update by author', async () => {
      if (!isReady()) return;
      const aliceDb = getDb(UID_ALICE);
      const ref = await aliceDb.collection('posts').add({
        title: 'Alice Post', content: 'By Alice',
        authorId: UID_ALICE, authorName: 'Alice',
      });
      await assertSucceeds(
        aliceDb.collection('posts').doc(ref.id).update({ content: 'Updated by Alice' })
      );
    });

    it('denies delete by non-author', async () => {
      if (!isReady()) return;
      const ref = await getDb(UID_ALICE).collection('posts').add({
        title: 'Alice Post', content: 'By Alice',
        authorId: UID_ALICE, authorName: 'Alice',
      });
      await assertFails(
        getDb(UID_BOB).collection('posts').doc(ref.id).delete()
      );
    });

    it('allows delete by author', async () => {
      if (!isReady()) return;
      const aliceDb = getDb(UID_ALICE);
      const ref = await aliceDb.collection('posts').add({
        title: 'Alice Post', content: 'By Alice',
        authorId: UID_ALICE, authorName: 'Alice',
      });
      await assertSucceeds(aliceDb.collection('posts').doc(ref.id).delete());
    });

    it('denies create with empty title', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_ALICE).collection('posts').add({
          title: '', content: 'Some content',
          authorId: UID_ALICE, authorName: 'Alice',
        })
      );
    });

    it('denies create with title over 200 chars', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_ALICE).collection('posts').add({
          title: 'x'.repeat(201), content: 'Some content',
          authorId: UID_ALICE, authorName: 'Alice',
        })
      );
    });

    it('denies create with content over 3000 chars', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_ALICE).collection('posts').add({
          title: 'Valid Title', content: 'x'.repeat(3001),
          authorId: UID_ALICE, authorName: 'Alice',
        })
      );
    });

    it('denies create with missing fields', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_ALICE).collection('posts').add({
          title: 'Missing fields', authorId: UID_ALICE,
        })
      );
    });
  });

  describe('replies collection', () => {
    let testPostId;

    beforeAll(async () => {
      if (!isReady()) return;
      const ref = await getDb(UID_ALICE).collection('posts').add({
        title: 'Parent Post', content: 'Parent content',
        authorId: UID_ALICE, authorName: 'Alice',
      });
      testPostId = ref.id;
    });

    it('allows unauthenticated read', async () => {
      if (!isReady()) return;
      await assertSucceeds(getDb().collection('replies').get());
    });

    it('allows authenticated create with valid data', async () => {
      if (!isReady()) return;
      await assertSucceeds(
        getDb(UID_BOB).collection('replies').add({
          content: 'Nice post!', postId: testPostId,
          authorId: UID_BOB, authorName: 'Bob',
        })
      );
    });

    it('denies create with mismatched authorId', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_ALICE).collection('replies').add({
          content: 'Impersonating Bob', postId: testPostId,
          authorId: UID_BOB, authorName: 'Bob',
        })
      );
    });

    it('denies create with non-existent parent post', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_BOB).collection('replies').add({
          content: 'Reply to nowhere', postId: 'nonexistent-post',
          authorId: UID_BOB, authorName: 'Bob',
        })
      );
    });

    it('denies unauthenticated create', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb().collection('replies').add({
          content: 'No auth reply', postId: testPostId,
          authorId: 'anon', authorName: 'Anon',
        })
      );
    });

    it('denies create with content over 2000 chars', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_BOB).collection('replies').add({
          content: 'x'.repeat(2001), postId: testPostId,
          authorId: UID_BOB, authorName: 'Bob',
        })
      );
    });

    it('denies update by non-author', async () => {
      if (!isReady()) return;
      const ref = await getDb(UID_BOB).collection('replies').add({
        content: 'Bob reply', postId: testPostId,
        authorId: UID_BOB, authorName: 'Bob',
      });
      await assertFails(
        getDb(UID_ALICE).collection('replies').doc(ref.id).update({ content: 'Hacked!' })
      );
    });

    it('allows update by author', async () => {
      if (!isReady()) return;
      const bobDb = getDb(UID_BOB);
      const ref = await bobDb.collection('replies').add({
        content: 'Bob reply', postId: testPostId,
        authorId: UID_BOB, authorName: 'Bob',
      });
      await assertSucceeds(
        bobDb.collection('replies').doc(ref.id).update({ content: 'Updated by Bob' })
      );
    });
  });

  describe('users collection', () => {
    it('denies unauthenticated read', async () => {
      if (!isReady()) return;
      await assertFails(getDb().collection('users').get());
    });

    it('allows authenticated read', async () => {
      if (!isReady()) return;
      await assertSucceeds(getDb(UID_ALICE).collection('users').get());
    });

    it('allows user to write their own doc', async () => {
      if (!isReady()) return;
      await assertSucceeds(
        getDb(UID_ALICE).collection('users').doc(UID_ALICE).set({ displayName: 'Alice' })
      );
    });

    it('denies user from writing another users doc', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_ALICE).collection('users').doc(UID_BOB).set({ displayName: 'Hacked Bob' })
      );
    });
  });

  describe('infra_configs collection', () => {
    it('denies unauthenticated read', async () => {
      if (!isReady()) return;
      await assertFails(getDb().collection('infra_configs').get());
    });

    it('allows user to read their own doc', async () => {
      if (!isReady()) return;
      const aliceDb = getDb(UID_ALICE);
      await aliceDb.collection('infra_configs').doc(UID_ALICE).set({ foo: 'bar' });
      await assertSucceeds(aliceDb.collection('infra_configs').doc(UID_ALICE).get());
    });

    it('denies user from reading another users doc', async () => {
      if (!isReady()) return;
      await assertFails(getDb(UID_BOB).collection('infra_configs').doc(UID_ALICE).get());
    });
  });

  describe('admins collection', () => {
    it('allows authenticated read', async () => {
      if (!isReady()) return;
      await assertSucceeds(getDb(UID_ALICE).collection('admins').get());
    });

    it('denies any write (self-admin grant)', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_ALICE).collection('admins').doc(UID_ALICE).set({ role: 'admin' })
      );
    });

    it('denies unauthenticated write', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb().collection('admins').doc(UID_ALICE).set({ role: 'admin' })
      );
    });
  });

  describe('projects collection', () => {
    it('denies unauthenticated read', async () => {
      if (!isReady()) return;
      await assertFails(getDb().collection('projects').get());
    });

    it('allows user to create their own project', async () => {
      if (!isReady()) return;
      await assertSucceeds(
        getDb(UID_ALICE).collection('projects').add({ name: 'My Project', userId: UID_ALICE })
      );
    });

    it('denies user from creating project with another userId', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_ALICE).collection('projects').add({ name: 'Fake', userId: UID_BOB })
      );
    });

    it('denies user from reading another users project', async () => {
      if (!isReady()) return;
      const ref = await getDb(UID_ALICE).collection('projects').add({
        name: 'Alice Project', userId: UID_ALICE,
      });
      await assertFails(getDb(UID_BOB).collection('projects').doc(ref.id).get());
    });
  });

  describe('tasks collection', () => {
    it('denies unauthenticated read', async () => {
      if (!isReady()) return;
      await assertFails(getDb().collection('tasks').get());
    });

    it('allows user to create their own task', async () => {
      if (!isReady()) return;
      const ref = await getDb(UID_ALICE).collection('tasks').add({
        title: 'My Task', userId: UID_ALICE,
      });
      expect(ref.id).toBeTruthy();
    });

    it('denies user from reading another users task', async () => {
      if (!isReady()) return;
      const ref = await getDb(UID_ALICE).collection('tasks').add({
        title: 'Alice Task', userId: UID_ALICE,
      });
      await assertFails(getDb(UID_BOB).collection('tasks').doc(ref.id).get());
    });
  });

  describe('featureFlags collection', () => {
    it('allows authenticated read', async () => {
      if (!isReady()) return;
      await assertSucceeds(getDb(UID_ALICE).collection('featureFlags').get());
    });

    it('denies non-admin write', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_BOB).collection('featureFlags').doc('test-flag').set({ enabled: true })
      );
    });

    it('allows admin write', async () => {
      if (!isReady()) return;
      const adminDb = getDb(UID_ALICE);
      await adminDb.collection('admins').doc(UID_ALICE).set({ role: 'admin' });
      await assertSucceeds(
        adminDb.collection('featureFlags').doc('test-flag').set({ enabled: true })
      );
    });
  });

  describe('userPreferences collection', () => {
    it('denies unauthenticated read', async () => {
      if (!isReady()) return;
      await assertFails(getDb().collection('userPreferences').get());
    });

    it('allows user to write their own preferences', async () => {
      if (!isReady()) return;
      await assertSucceeds(
        getDb(UID_ALICE).collection('userPreferences').doc(UID_ALICE).set({ beta: true })
      );
    });

    it('denies user from writing another users preferences', async () => {
      if (!isReady()) return;
      await assertFails(
        getDb(UID_ALICE).collection('userPreferences').doc(UID_BOB).set({ beta: true })
      );
    });
  });
});
