import React from 'react';

const About = () => {
  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <div className="bg-white shadow-md rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-4">About SecureAgentBase</h1>
        <p className="mb-4">
          SecureAgentBase is a React + Firebase application framework designed for 
          autonomous agent workflows. It provides a solid foundation for building 
          modern web applications with authentication, database, and deployment 
          automation.
        </p>
        
        <h2 className="text-xl font-semibold mb-3">Features</h2>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>React 19 with Vite for fast development</li>
          <li>Firebase Authentication (email/password + Google)</li>
          <li>Firestore for real-time data</li>
          <li>TailwindCSS for styling</li>
          <li>GitHub Actions CI/CD for automated deployment</li>
          <li>Feature flags via Firestore</li>
        </ul>

        <h2 className="text-xl font-semibold mb-3">Getting Started</h2>
        <p className="mb-4">
          Run <code className="bg-gray-100 px-2 py-1 rounded">npm run setup</code> to configure your 
          Firebase project and GitHub secrets. Then open the project in your favorite 
          agentic coding tool and tell it to deploy your app!
        </p>
      </div>
    </div>
  );
};

export default About;
