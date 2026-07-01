import { ReactNode } from 'react';

interface BannerProps {
  type: 'localhost' | 'staging' | 'production';
  children: ReactNode;
}

const Banner: React.FC<BannerProps> = ({ type, children }) => {
  const colors: Record<string, string> = {
    localhost: 'bg-yellow-500',
    staging: 'bg-orange-500',
    production: 'bg-blue-600'
  };
  return (
    <div className={`${colors[type]} text-center p-2 text-white font-medium fixed w-full top-0 z-[9999]`}>
      {children}
    </div>
  );
};

const EnvironmentBanner: React.FC = () => {
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isStaging = hostname.includes('staging');
  
  const version = import.meta.env.VITE_APP_VERSION || 'dev';
  const db = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'unknown';

  const formatVersion = (v: string): string => {
    if (v.startsWith('v')) return v;
    return v.substring(0, 7);
  };

  if (isLocalhost) {
    return (
      <Banner type="localhost">
        LOCALHOST | DB: {db} | v{formatVersion(version)}
      </Banner>
    );
  }

  if (isStaging) {
    return (
      <Banner type="staging">
        STAGING | DB: {db} | v{formatVersion(version)}
      </Banner>
    );
  }

  return null;
};

export default EnvironmentBanner;
