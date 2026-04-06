import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { getPost, getReplies } from './firestore-utils/post-storage';
import { Firestore } from 'firebase/firestore';
import type { Post, Reply } from './types';

interface PostProps {
  db: Firestore;
}

const Post: React.FC<PostProps> = ({ db }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const postId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);

  useEffect(() => {
    const loadPost = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);

        if (!postId) {
          setError('No post specified');
          return;
        }

        const fetchedPost = await getPost(db, postId);
        
        if (!fetchedPost) {
          setError('Post not found');
          return;
        }

        setPost(fetchedPost);
        
        const fetchedReplies = await getReplies(db, postId);
        setReplies(fetchedReplies);
      } catch (err) {
        console.error('Error loading post:', err);
        setError('Failed to load post');
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [db, postId]);

  const formatDate = (timestamp: Date | undefined): string => {
    if (!timestamp) return '';
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{error || 'Post not found'}</h2>
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-700"
          >
            Back to posts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate('/')}
          className="text-blue-600 hover:text-blue-700 mb-4"
        >
          ← Back to posts
        </button>

        <article className="bg-white rounded-lg shadow-sm p-8 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {post.title}
          </h1>
          
          <div className="flex items-center text-sm text-gray-500 mb-6">
            <span className="font-medium mr-2">{post.authorName}</span>
            <span className="mx-2">•</span>
            <span>{formatDate(post.createdAt)}</span>
          </div>

          <div className="prose max-w-none text-gray-800 whitespace-pre-wrap">
            {post.content}
          </div>
        </article>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
          </h2>
          
          <button
            onClick={() => navigate(`/compose-reply?id=${postId}`)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
          >
            <MessageCircle size={20} />
            Add Reply
          </button>
        </div>

        {replies.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-gray-600 mb-4">No replies yet. Be the first to respond!</p>
            <button
              onClick={() => navigate(`/compose-reply?id=${postId}`)}
              className="bg-blue-600 text-white px-6 py-3 rounded-full font-medium hover:bg-blue-700 inline-block"
            >
              Add Reply
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {replies.map(reply => (
              <div key={reply.id} className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center text-sm text-gray-500 mb-3">
                  <span className="font-medium mr-2">{reply.authorName}</span>
                  <span className="mx-2">•</span>
                  <span>{formatDate(reply.createdAt)}</span>
                </div>
                <div className="text-gray-800 whitespace-pre-wrap">
                  {reply.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Post;
