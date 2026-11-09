import { useNavigate } from 'react-router';
import { Rocket, Bot, Cloud, Terminal, ShieldCheck, Smartphone } from 'lucide-react';
import { GITHUB_REPO_URL } from './legal-urls';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-8 sm:py-16">
        <div className="text-center mb-8 sm:mb-10">
          <p className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-3">
            Sovereign AI infrastructure • Zero lock-in
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            SecureAgentBase
          </h1>
          <h2 className="text-xl sm:text-3xl font-bold text-gray-900 mb-5 sm:mb-6">
            AI Agents Write Fast Code and Terrible Architecture.
            <br className="hidden sm:block" /> We Fix the Architecture.
          </h2>
          <p className="text-base sm:text-lg text-gray-600 mb-8 sm:mb-10 max-w-3xl mx-auto">
            Provision a locked-down GCP, Firebase, and GitHub Actions factory in one command.
            Agents work through spec-first skills, security scans, and strict PR gates—commanded
            from Discord.
          </p>

          {/* Example dispatch: a real engineering task, and the gates the agent passes through */}
          <div className="bg-gray-900 rounded-xl p-4 sm:p-5 text-left font-mono text-xs sm:text-sm shadow-lg">
            <p className="text-gray-500 text-xs mb-2 sm:mb-3 flex items-center gap-2">
              <Smartphone size={14} /> from your phone, in Discord
            </p>
            <p className="text-blue-300 mb-3 sm:mb-4 break-words leading-relaxed">
              @agent Add Stripe webhooks with idempotency keys, tighten the Firestore rules for
              tenant isolation, and scan before opening a staging PR.
            </p>
            <div className="space-y-1.5 text-green-400 leading-relaxed">
              <p>✓ Architectural spec drafted &amp; validated</p>
              <p>✓ Rules + webhook handler — 40 rules tests pass</p>
              <p>✓ Security scan + unit suite: 0 vulnerabilities</p>
              <p>✓ PR opened against staging — awaiting your approval</p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <div className="bg-white rounded-xl shadow-sm p-8 flex flex-col border-2 border-emerald-200">
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center mb-4">
              <Terminal className="text-emerald-600" size={24} />
            </div>
            <h3 className="font-semibold text-xl mb-2">One-Command Bootstrap</h3>
            <p className="text-gray-600 text-sm mb-4 flex-1">
              A self-assembling infrastructure layer: your own GCP project, Firebase backend, and
              GitHub Actions CI/CD pipeline, provisioned from the terminal. Credentials stay in
              your environment — never ours.
            </p>
            <div className="bg-gray-900 rounded-lg p-4 mb-4">
              <code className="text-green-400 text-sm font-mono">
                <span className="text-gray-500">$</span> npm install -g secureagentbase<br/>
                <span className="text-gray-500">$</span> secureagentbase init
              </code>
            </div>
            <p className="text-gray-500 text-xs">
              Supports <code className="bg-gray-100 px-1 rounded">--project-id</code>, <code className="bg-gray-100 px-1 rounded">--billing-account</code>, and <code className="bg-gray-100 px-1 rounded">--auto-sa</code>. Run <code className="bg-gray-100 px-1 rounded">secureagentbase --help</code> for the full list.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-8 flex flex-col relative">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Rocket className="text-blue-600" size={24} />
            </div>
            <h3 className="font-semibold text-xl mb-2">Web Wizard</h3>
            <p className="text-gray-600 text-sm mb-4 flex-1">
              Prefer a browser? The same guided walkthrough connects your GCP project, GitHub,
              Firebase, and Discord end-to-end.
            </p>
            <button
              onClick={() => navigate('/infra-setup')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-base px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all hover:scale-105"
            >
              <Rocket size={20} />
              Launch Setup Wizard
            </button>
            <span className="inline-block mt-3 text-xs text-amber-600 bg-amber-50 rounded-md px-2 py-1 self-start">
              Works today — Google sign-in verification in progress
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="text-red-600" size={24} />
            </div>
            <h3 className="font-semibold text-lg mb-2">Deterministic Guardrails</h3>
            <p className="text-gray-600 text-sm">
              Agents don't cowboy-code into production. Every repo ships with spec-first agent
              skills, validated Firestore writes, tested security rules, static security scans on
              every PR, and a protected <code className="bg-gray-100 px-1 rounded">main</code>.
            </p>
          </div>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white rounded-xl shadow-sm p-6 text-center block hover:shadow-md transition-shadow"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Cloud className="text-purple-600" size={24} />
            </div>
            <h3 className="font-semibold text-lg mb-2">Sovereign BYO-Cloud</h3>
            <p className="text-gray-600 text-sm">
              No proprietary sandboxes, no compute markups. One command provisions the stack in
              your GCP account. Your cloud, your keys, your code.
            </p>
            <p className="text-purple-600 text-sm mt-3 font-medium">View the source →</p>
          </a>
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Bot className="text-blue-600" size={24} />
            </div>
            <h3 className="font-semibold text-lg mb-2">Asynchronous Mobile Command</h3>
            <p className="text-gray-600 text-sm">
              Bootstrap in the terminal once, then command the factory from Discord. Dispatch
              specs, review PRs, and direct staging merges from your phone while away from the desk.
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
                <p className="text-gray-600">One command provisions your GCP project, Firebase apps, and GitHub Actions pipeline.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold flex-shrink-0">2</div>
              <div>
                <h3 className="font-semibold">Describe Your App</h3>
                <p className="text-gray-600">
                  Dispatch a real task in Discord: &quot;Add Stripe webhook handling with idempotency
                  keys and tighten the Firestore security rules.&quot;
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold flex-shrink-0">3</div>
              <div>
                <h3 className="font-semibold">AI Builds It — Inside the Cage</h3>
                <p className="text-gray-600">
                  OpenCode agents draft a spec, implement it behind guardrails, and open a PR that
                  must pass unit tests, typecheck, and static security scans.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-semibold flex-shrink-0">4</div>
              <div>
                <h3 className="font-semibold">Deploy</h3>
                <p className="text-gray-600">Merge the PR to deploy to staging. Tag a release for production.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
