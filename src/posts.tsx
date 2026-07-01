import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { MessageCircle, Plus, Rocket, Bot, Github, Cloud } from 'lucide-react';
import { getPosts, searchPosts } from './firestore-utils/post-storage';
import { useAuth } from './firestore-utils/auth-context';
import { Firestore } from 'firebase/firestore';
import type { Post } from './types';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            SecureAgentBase
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Build full-stack apps entirely from Discord. No terminal required.
          </p>
          <button
            onClick={() => navigate('/infra-setup')}
            className="bg-green-600 hover:bg-green-700 text-white text-lg px-8 py-4 rounded-lg font-semibold flex items-center gap-3 mx-auto transition-all hover:scale-105"
          >
            <Rocket size={24} />
            Deploy our SecureAgent App!
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Bot className="text-blue-600" size={24} />
            </div>
            <h3 className="font-semibold text-lg mb-2">Discord-First</h3>
            <p className="text-gray-600 text-sm">
              Describe what you want to build in Discord. AI agents handle the rest.
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Github className="text-green-600" size={24} />
            </div>
            <h3 className="font-semibold text-lg mb-2">GitHub Powered</h3>
            <p className="text-gray-600 text-sm">
              Your app lives in a GitHub repo with Actions, issues, and PRs.
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Cloud className="text-purple-600" size={24} />
            </div>
            <h3 className="font-semibold text-lg mb-2">Cloud Deployed</h3>
            <p className="text-gray-600 text-sm">
              Automatic staging and production deployments to Firebase.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8">
          <h2 className="text-2xl font-bold text-center mb-6">How It Works</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold flex-shrink-0">1</div>
              <div>
                <h3 className="font-semibold">Deploy SecureAgent</h3>
                <p className="text-gray-600">Connect your GCP project, GitHub, and Discord accounts.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold flex-shrink-0">2</div>
              <div>
                <h3 className="font-semibold">Describe Your App</h3>
                <p className="text-gray-600">Send a message to your Discord bot: "Build a todo app with user auth"</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold flex-shrink-0">3</div>
              <div>
                <h3 className="font-semibold">AI Builds It</h3>
                <p className="text-gray-600">OpenCode agents create specs, write code, run tests, and open a PR.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-semibold flex-shrink-0">4</div>
              <div>
                <h3 className="font-semibold">Deploy</h3>
                <p className="text-gray-600">Merge the PR to deploy to staging. Create a release for production.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PostsProps {
  db: Firestore;
}

const Posts: React.FC<PostsProps> = ({ db }) => {
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('q');
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const loadPosts = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        
        let fetchedPosts: Post[];
        if (searchQuery) {
          fetchedPosts = await searchPosts(db, searchQuery);
        } else {
          fetchedPosts = await getPosts(db);
        }
        
        setPosts(fetchedPosts);
      } catch (err) {
        console.error('Error loading posts:', err);
        setError('Failed to load posts');
      } finally {
        setLoading(false);
      }
    };

    loadPosts();
  }, [db, searchQuery]);

  const formatDate = (timestamp: Date | undefined): string => {
    if (!timestamp) return '';
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            {searchQuery ? `Results for "${searchQuery}"` : 'Recent Posts'}
          </h1>
          {user && (
            <Link
              to="/compose-post"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus size={20} />
              New Post
            </Link>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading posts...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-600">
            {error}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No posts found
            </h2>
            <p className="text-gray-600 mb-4">
              {searchQuery ? 'Try a different search term' : 'Be the first to create a post!'}
            </p>
            {user && (
              <Link
                to="/compose-post"
                className="bg-blue-600 text-white px-6 py-3 rounded-full font-medium hover:bg-blue-700 inline-block"
              >
                Create Post
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <Link
                key={post.id}
                to={`/post?id=${post.id}`}
                className="block bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  {post.title}
                </h2>
                <p className="text-gray-600 mb-4 line-clamp-2">
                  {post.content}
                </p>
                <div className="flex items-center text-sm text-gray-500">
                  <span className="font-medium mr-2">{post.authorName}</span>
                  <span className="mx-2">•</span>
                  <span>{formatDate(post.createdAt)}</span>
                  <span className="mx-2">•</span>
                  <span className="flex items-center gap-1">
                    <MessageCircle size={16} />
                    {post.replyCount || 0} replies
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Posts;
export { LandingPage };
