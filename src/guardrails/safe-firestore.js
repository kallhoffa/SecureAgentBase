import { collection, addDoc, updateDoc, deleteDoc, getDoc, getDocs, doc, query, where, orderBy, limit, serverTimestamp, Firestore } from 'firebase/firestore';

const AUDIT_FIELDS = ['createdBy', 'updatedBy', 'createdAt', 'updatedAt'];
const RESERVED_FIELDS = ['createdAt', 'updatedAt', 'replyCount'];

const stripReserved = (data) => {
  const clean = { ...data };
  for (const key of RESERVED_FIELDS) delete clean[key];
  return clean;
};

const filterFields = (data, allowFields) => {
  if (!allowFields) return stripReserved(data);
  const clean = {};
  for (const key of allowFields) {
    if (key in data) clean[key] = data[key];
  }
  return clean;
};

export const safeCreate = async (db, collectionName, data, userId, opts = {}) => {
  if (!userId) throw new Error('safeCreate: userId is required');
  if (!data || typeof data !== 'object') throw new Error('safeCreate: data must be an object');

  const clean = filterFields(data, opts.allowFields);
  const docData = {
    ...clean,
    createdBy: userId,
    updatedBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = collection(db, collectionName);
  const docRef = await addDoc(ref, docData);
  return docRef.id;
};

export const safeUpdate = async (db, collectionName, docId, data, userId, opts = {}) => {
  if (!userId) throw new Error('safeUpdate: userId is required');
  if (!docId) throw new Error('safeUpdate: docId is required');

  const clean = filterFields(data, opts.allowFields);
  const docData = {
    ...clean,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
  };

  if (opts.requireOwnership) {
    const ref = doc(db, collectionName, docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error(`Document ${docId} not found`);
    if (snap.data().createdBy !== userId) throw new Error('You do not have permission to update this document');
  }

  const ref = doc(db, collectionName, docId);
  await updateDoc(ref, docData);
};

export const safeDelete = async (db, collectionName, docId, userId, opts = {}) => {
  if (!userId) throw new Error('safeDelete: userId is required');
  if (!docId) throw new Error('safeDelete: docId is required');

  if (opts.requireOwnership) {
    const ref = doc(db, collectionName, docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error(`Document ${docId} not found`);
    if (snap.data().createdBy !== userId) throw new Error('You do not have permission to delete this document');
  }

  const ref = doc(db, collectionName, docId);
  await deleteDoc(ref);
};

export const safeQuery = async (db, collectionName, userId, opts = {}) => {
  if (!userId) throw new Error('safeQuery: userId is required');

  const constraints = [];
  constraints.push(where('createdBy', '==', userId));
  constraints.push(orderBy('createdAt', opts.sortOrder === 'asc' ? 'asc' : 'desc'));
  if (opts.maxResults) constraints.push(limit(opts.maxResults));

  const ref = collection(db, collectionName);
  const q = query(ref, ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};
