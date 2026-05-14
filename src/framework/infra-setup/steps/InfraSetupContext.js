import { createContext, useContext } from 'react';

const InfraSetupContext = createContext(null);

export const useInfraSetup = () => {
  const ctx = useContext(InfraSetupContext);
  if (!ctx) throw new Error('useInfraSetup must be used within InfraSetup');
  return ctx;
};

export default InfraSetupContext;
