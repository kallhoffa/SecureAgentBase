import { 
  collection, 
  addDoc, 
  getDoc, 
  getDocs, 
  doc, 
  query, 
  orderBy, 
  limit,
  where,
  serverTimestamp 
} from 'firebase/firestore';

export const createPost = async (db, postData) => {
  const postsRef = collection(db, 'posts');
  const docRef = await addDoc(postsRef, {
    ...postData,
    replyCount: 0,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

export const getPost = async (db, postId) => {
  const postDoc = doc(db, 'posts', postId);
  const snapshot = await getDoc(postDoc);
  
  if (snapshot.exists()) {
    return { id: snapshot.id, ...snapshot.data() };
  }
  return null;
};

export const getPosts = async (db, maxPosts = 50) => {
  const postsRef = collection(db, 'posts');
  const q = query(
    postsRef,
    orderBy('createdAt', 'desc'),
    limit(maxPosts)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

export const searchPosts = async (db, searchQuery) => {
  const postsRef = collection(db, 'posts');
  const q = query(
    postsRef,
    where('title', '>=', searchQuery),
    where('title', '<=', searchQuery + '\uf8ff'),
    orderBy('title'),
    limit(20)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

export const addReply = async (db, postId, replyData) => {
  const repliesRef = collection(db, 'replies');
  const docRef = await addDoc(repliesRef, {
    ...replyData,
    postId,
    createdAt: serverTimestamp(),
  });
  
  const postDoc = doc(db, 'posts', postId);
  const postSnapshot = await getDoc(postDoc);
  if (postSnapshot.exists()) {
    const currentCount = postSnapshot.data().replyCount || 0;
    await updateDoc(postDoc, { replyCount: currentCount + 1 });
  }
  
  return docRef.id;
};

export const getReplies = async (db, postId) => {
  const repliesRef = collection(db, 'replies');
  const q = query(
    repliesRef,
    where('postId', '==', postId),
    orderBy('createdAt', 'asc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};
