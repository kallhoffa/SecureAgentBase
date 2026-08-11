import { Link } from 'react-router';

const Privacy: React.FC = () => {
  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <div className="bg-white shadow-md rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2">SecureAgentBase Privacy Policy</h1>
        <p className="text-gray-600 text-sm mb-6">
          Effective date: August 2026 &middot; Operated by Anthony Kallhoff &middot; Contact:{' '}
          <a className="text-blue-600" href="mailto:kallhoff@gmail.com">kallhoff@gmail.com</a>{' '}
          &middot; <Link to="/terms" className="text-blue-600">Terms of Service</Link>
        </p>

        <h2 className="text-xl font-semibold mb-3">1. Data We Collect</h2>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li><strong>Account information</strong> &mdash; your name and email address when you sign in with Google or Firebase Authentication.</li>
          <li><strong>App data you create</strong> &mdash; content you create in the app (such as posts, tasks, profiles, and project settings), stored in Firestore.</li>
          <li><strong>Wizard session tokens</strong> &mdash; short-lived Google OAuth access tokens used to perform Google Cloud and Firebase actions in <em>your</em> Google Cloud project during infra-setup. These are held only in your browser session and are never stored on our servers.</li>
        </ul>

        <h2 className="text-xl font-semibold mb-3">2. How We Use Your Data</h2>
        <p className="mb-4">
          We use your data solely to operate the product: to authenticate you, to store and deliver the
          app data you create, and to perform infra-setup actions in your Google Cloud project using the
          scopes you approved on the Google consent screen.
        </p>

        <h2 className="text-xl font-semibold mb-3">3. Your Google Cloud Data</h2>
        <p className="mb-4">
          The infra-setup wizard operates on <strong>your own Google Cloud project</strong> with your explicit
          consent. We do not copy, store, or retain your Google Cloud resources, IAM policies, or project
          configuration on our systems.
        </p>

        <h2 className="text-xl font-semibold mb-3">4. Data Retention</h2>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>App data is retained while your account is active.</li>
          <li>On account deletion, your app data is deleted within 30 days; backups are purged within 60 days.</li>
          <li>Operational logs are retained for 30 days.</li>
          <li>Wizard OAuth tokens are not persisted.</li>
        </ul>

        <h2 className="text-xl font-semibold mb-3">5. Sharing</h2>
        <p className="mb-4">
          We do not sell your data. Service providers (Google Cloud / Firebase for hosting and data storage,
          Sentry for error monitoring) process data on our behalf under their own terms and data-processing
          agreements.
        </p>

        <h2 className="text-xl font-semibold mb-3">6. Security</h2>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>Encryption in transit for all traffic.</li>
          <li>Firebase Security Rules enforce per-user ownership of Firestore documents.</li>
          <li>Firestore writes are allowlisted and validated; user-triggered actions are rate limited.</li>
        </ul>

        <h2 className="text-xl font-semibold mb-3">7. Google API Services Limited Use</h2>
        <p className="mb-4">
          SecureAgentBase&apos;s use of Google APIs and the data you authorize through the Google consent
          screen complies with the <a className="text-blue-600" href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
          including its Limited Use requirements: your data is used only to provide and improve our
          user-facing features; it is never used for advertising, sold to data brokers, or used for credit
         worthiness determinations; human access is restricted to our operators for support and security
          purposes; and data is transferred only to power user-facing features, or for security, legal, or
          merger-related reasons, never for AI/ML training without your explicit consent.
        </p>

        <h2 className="text-xl font-semibold mb-3">8. Contact</h2>
        <p>
          Questions about this policy or your data: <strong>Anthony Kallhoff</strong> &mdash;{' '}
          <a className="text-blue-600" href="mailto:kallhoff@gmail.com">kallhoff@gmail.com</a>.
        </p>
      </div>
    </div>
  );
};

export default Privacy;
