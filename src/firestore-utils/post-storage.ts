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
  serverTimestamp,
  updateDoc,
  Firestore,
  DocumentData,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import type { Post, Reply } from '../types';

interface PostData {
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
}

interface ReplyData {
  content: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
}

const mapDocToPost = (docSnap: QueryDocumentSnapshot<DocumentData>): Post => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    title: data.title,
    content: data.content,
    authorId: data.authorId,
    authorName: data.authorName,
    authorPhoto: data.authorPhoto,
    replyCount: data.replyCount || 0,
    createdAt: data.createdAt?.toDate() || new Date()
  };
};

const mapDocToReply = (docSnap: QueryDocumentSnapshot<DocumentData>): Reply => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    postId: data.postId,
    content: data.content,
    authorId: data.authorId,
    authorName: data.authorName,
    authorPhoto: data.authorPhoto,
    createdAt: data.createdAt?.toDate() || new Date()
  };
};

export const createPost = async (db: Firestore, postData: PostData): Promise<string> => {
  const postsRef = collection(db, 'posts');
  const docRef = await addDoc(postsRef, {
    ...postData,
    replyCount: 0,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

export const getPost = async (db: Firestore, postId: string): Promise<Post | null> => {
  const postDoc = doc(db, 'posts', postId);
  const snapshot = await getDoc(postDoc);
  
  if (snapshot.exists()) {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      title: data.title,
      content: data.content,
      authorId: data.authorId,
      authorName: data.authorName,
      authorPhoto: data.authorPhoto,
      replyCount: data.replyCount || 0,
      createdAt: data.createdAt?.toDate() || new Date()
    };
  }
  return null;
};

export const getPosts = async (db: Firestore, maxPosts = 50): Promise<Post[]> => {
  const postsRef = collection(db, 'posts');
  const q = query(
    postsRef,
    orderBy('createdAt', 'desc'),
    limit(maxPosts)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      title: data.title,
      content: data.content,
      authorId: data.authorId,
      authorName: data.authorName,
      authorPhoto: data.authorPhoto,
      replyCount: data.replyCount || 0,
      createdAt: data.createdAt?.toDate() || new Date()
    };
  });
};

export const searchPosts = async (db: Firestore, searchQuery: string): Promise<Post[]> => {
  const postsRef = collection(db, 'posts');
  const q = query(
    postsRef,
    where('title', '>=', searchQuery),
    where('title', '<=', searchQuery + '\uf8ff'),
    orderBy('title'),
    limit(20)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      title: data.title,
      content: data.content,
      authorId: data.authorId,
      authorName: data.authorName,
      authorPhoto: data.authorPhoto,
      replyCount: data.replyCount || 0,
      createdAt: data.createdAt?.toDate() || new Date()
    };
  });
};

export const addReply = async (db: Firestore, postId: string, replyData: ReplyData): Promise<string> => {
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

export const getReplies = async (db: Firestore, postId: string): Promise<Reply[]> => {
  const repliesRef = collection(db, 'replies');
  const q = query(
    repliesRef,
    where('postId', '==', postId),
    orderBy('createdAt', 'asc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      postId: data.postId,
      content: data.content,
      authorId: data.authorId,
      authorName: data.authorName,
      authorPhoto: data.authorPhoto,
      createdAt: data.createdAt?.toDate() || new Date()
    };
  });
};
