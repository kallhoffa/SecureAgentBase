import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './firestore-utils/auth-context';
import { getPost, addReply } from './firestore-utils/post-storage';
import { Firestore } from 'firebase/firestore';
import type { Post } from './types';

interface ComposeReplyProps {
  db: Firestore;
}

const ComposeReply: React.FC<ComposeReplyProps> = ({ db }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const postId = searchParams.get('id');
  
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  
  const { user } = useAuth();

  useEffect(() => {
    const loadPost = async (): Promise<void> => {
      try {
        if (postId) {
          const fetchedPost = await getPost(db, postId);
          setPost(fetchedPost);
        }
      } catch (err) {
        console.error('Error loading post:', err);
        setError('Failed to load post');
      } finally {
        setLoading(false);
      }
    };

    if (postId) {
      loadPost();
    }
  }, [db, postId]);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    
    if (!content.trim()) {
      setError('Reply content cannot be empty');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await addReply(db, postId!, {
        content: content.trim(),
        authorId: user!.uid,
        authorName: user!.email || 'Anonymous',
      });
      
      navigate(`/post?id=${postId}`);
    } catch (err) {
      console.error('Error adding reply:', err);
      setError('Failed to add reply. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please sign in to reply.</p>
          <button
            onClick={() => navigate('/login')}
            className="bg-blue-600 text-white px-6 py-3 rounded-full font-medium hover:bg-blue-700"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Post not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(`/post?id=${postId}`)}
          className="text-blue-600 hover:text-blue-700 mb-4"
        >
          ← Back to post
        </button>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-500 mb-1">Replying to</h2>
          <h3 className="text-lg font-semibold text-gray-900">{post.title}</h3>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            Your Reply
          </h1>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label 
                htmlFor="reply-content" 
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Write your reply
              </label>
              <textarea
                id="reply-content"
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg 
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                         placeholder-gray-400 resize-y"
                placeholder="Share your thoughts..."
              />
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate(`/post?id=${postId}`)}
                className="text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-6 py-3 rounded-full text-white font-medium
                         ${isSubmitting 
                           ? 'bg-blue-400 cursor-not-allowed' 
                           : 'bg-blue-600 hover:bg-blue-700'
                         }`}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Reply'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ComposeReply;
