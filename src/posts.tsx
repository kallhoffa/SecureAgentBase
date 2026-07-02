import { useNavigate } from 'react-router-dom';
import { Rocket, Bot, Github, Cloud } from 'lucide-react';

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
                <p className="text-gray-600">Send a message to your Discord bot: &quot;Build a todo app with user auth&quot;</p>
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

export default LandingPage;
