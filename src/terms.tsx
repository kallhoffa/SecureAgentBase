import { Link } from 'react-router';

const Terms: React.FC = () => {
  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <div className="bg-white shadow-md rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2">SecureAgentBase Terms of Service</h1>
        <p className="text-gray-600 text-sm mb-6">
          Effective date: August 2026 &middot; Operated by Anthony Kallhoff &middot; Contact:{' '}
          <a className="text-blue-600" href="mailto:kallhoff@gmail.com">kallhoff@gmail.com</a>{' '}
          &middot; <Link to="/privacy" className="text-blue-600">Privacy Policy</Link>
        </p>

        <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
        <p className="mb-4">
          By accessing or using SecureAgentBase (&ldquo;the Service&rdquo;), you agree to these Terms of
          Service and to the <Link to="/privacy" className="text-blue-600">Privacy Policy</Link>. If you
          do not agree, please do not use the Service.
        </p>

        <h2 className="text-xl font-semibold mb-3">2. Description of the Service</h2>
        <p className="mb-4">
          SecureAgentBase is an application framework built on React and Firebase. It provides
          authentication (including Google sign-in), Firestore-backed app data, and &mdash; in the app
          edition &mdash; an infrastructure setup wizard that provisions resources in your own Google
          Cloud project.
        </p>

        <h2 className="text-xl font-semibold mb-3">3. Accounts and Credentials</h2>
        <p className="mb-4">
          You are responsible for safeguarding your account credentials and for all activity that occurs
          under your account. We never receive or store your Google password; sign-in is handled by
          Firebase Authentication / Google on your behalf.
        </p>

        <h2 className="text-xl font-semibold mb-3">4. Wizard and Google Cloud Access</h2>
        <p className="mb-4">
          The infrastructure setup wizard performs actions in <strong>your own Google Cloud project</strong>{' '}
          (creating VMs, service accounts, Firebase apps, and similar resources) using the scopes you
          approve on the Google consent screen (<code>cloud-platform</code> and{' '}
          <code>cloud-billing.readonly</code>). You are solely responsible for the resources created and
          any costs incurred in your project, and you should review wizard actions before they are
          executed. We do not copy, store, or retain your Google Cloud resources, IAM policies, or
          credentials.
        </p>

        <h2 className="text-xl font-semibold mb-3">5. Acceptable Use</h2>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>Use the Service for unlawful purposes.</li>
          <li>Interfere with or disrupt the Service or its infrastructure.</li>
          <li>Attempt to access other users&apos; data or accounts.</li>
          <li>Resell or scrape the Service without permission.</li>
        </ul>

        <h2 className="text-xl font-semibold mb-3">6. Your Content and Intellectual Property</h2>
        <p className="mb-4">
          Content you create in the Service remains yours. The Service&apos;s underlying framework code
          is provided under its open-source license. Nothing in these Terms grants you rights to our
          trademarks or branding.
        </p>

        <h2 className="text-xl font-semibold mb-3">7. Disclaimer of Warranties</h2>
        <p className="mb-4">
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of
          any kind, express or implied, including warranties of merchantability and fitness for a
          particular purpose. Automated agents perform actions on your behalf &mdash; you are responsible
          for reviewing their output before relying on it.
        </p>

        <h2 className="text-xl font-semibold mb-3">8. Limitation of Liability</h2>
        <p className="mb-4">
          To the maximum extent permitted by law, the operator shall not be liable for indirect,
          incidental, special, consequential, or punitive damages, or for any loss of profits, data, or
          goodwill, arising from your use of the Service.
        </p>

        <h2 className="text-xl font-semibold mb-3">9. Termination</h2>
        <p className="mb-4">
          You may stop using the Service and delete your account at any time. We may suspend or terminate
          access to the Service for violations of these Terms or applicable law.
        </p>

        <h2 className="text-xl font-semibold mb-3">10. Changes to These Terms</h2>
        <p className="mb-4">
          We may update these Terms from time to time. Material changes will be reflected on this page
          with an updated effective date. Continued use of the Service after changes are posted
          constitutes acceptance of the updated Terms.
        </p>

        <h2 className="text-xl font-semibold mb-3">11. Governing Law</h2>
        <p className="mb-4">
          These Terms are governed by the laws of the United States, without regard to conflict-of-law
          principles.
        </p>

        <h2 className="text-xl font-semibold mb-3">12. Contact</h2>
        <p>
          Questions about these Terms: <strong>Anthony Kallhoff</strong> &mdash;{' '}
          <a className="text-blue-600" href="mailto:kallhoff@gmail.com">kallhoff@gmail.com</a>.
        </p>
      </div>
    </div>
  );
};

export default Terms;
