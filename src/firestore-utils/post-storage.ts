import {
  collection,
  getDoc,
  getDocs,
  doc,
  query,
  orderBy,
  limit,
  where,
  Firestore,
  DocumentData,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import type { Post, Reply } from '../types';
import { validate } from '../guardrails/validate';
import { safeCreate, safeUpdate } from '../guardrails/safe-firestore';

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

const POST_SCHEMA = {
  title: { type: 'string', required: true, minLength: 1, maxLength: 200, label: 'Title' },
  content: { type: 'string', required: true, minLength: 1, maxLength: 3000, label: 'Content' },
  authorId: { type: 'string', required: true, label: 'Author ID' },
  authorName: { type: 'string', required: true, maxLength: 100, label: 'Author name' },
};

const REPLY_SCHEMA = {
  content: { type: 'string', required: true, minLength: 1, maxLength: 2000, label: 'Content' },
  authorId: { type: 'string', required: true, label: 'Author ID' },
  authorName: { type: 'string', required: true, maxLength: 100, label: 'Author name' },
};

const POST_ALLOW_FIELDS = ['title', 'content', 'authorId', 'authorName', 'authorPhoto', 'replyCount'];
const REPLY_ALLOW_FIELDS = ['content', 'authorId', 'authorName', 'authorPhoto', 'postId'];

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

export const createPost = async (db: Firestore, postData: PostData, userId: string): Promise<string> => {
  const errors = validate(postData, POST_SCHEMA);
  if (errors) throw new Error(Object.values(errors)[0] as string);
  return safeCreate(db, 'posts', postData, userId, { allowFields: POST_ALLOW_FIELDS });
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

export const addReply = async (db: Firestore, postId: string, replyData: ReplyData, userId: string): Promise<string> => {
  const errors = validate(replyData, REPLY_SCHEMA);
  if (errors) throw new Error(Object.values(errors)[0] as string);

  const docId = await safeCreate(db, 'replies', { ...replyData, postId }, userId, { allowFields: REPLY_ALLOW_FIELDS });

  const postDoc = doc(db, 'posts', postId);
  const postSnapshot = await getDoc(postDoc);
  if (postSnapshot.exists()) {
    const currentCount = postSnapshot.data().replyCount || 0;
    await safeUpdate(db, 'posts', postId, { replyCount: currentCount + 1 }, userId, { allowFields: POST_ALLOW_FIELDS });
  }

  return docId;
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
