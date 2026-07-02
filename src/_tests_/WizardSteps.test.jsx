import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Step1 from '../framework/infra-setup/steps/Step1';
import Step2 from '../framework/infra-setup/steps/Step2';
import Step3 from '../framework/infra-setup/steps/Step3';
import Step4 from '../framework/infra-setup/steps/Step4';
import Step5 from '../framework/infra-setup/steps/Step5';
import Step6 from '../framework/infra-setup/steps/Step6';
import Step7 from '../framework/infra-setup/steps/Step7';

describe('Step1 - Auth Check', () => {
  it('returns null when not expanded', () => {
    const { container } = render(<Step1 expanded={false} user={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows signed-in message with user email', () => {
    render(<Step1 expanded user={{ email: 'test@example.com' }} />);
    expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    expect(screen.getByText(/test@example\.com/)).toBeInTheDocument();
  });

  it('shows sign-in prompt when no user', () => {
    render(<Step1 expanded user={null} />);
    expect(screen.getByText(/please sign in/i)).toBeInTheDocument();
  });
});

describe('Step2 - Service Account', () => {
  const baseProps = {
    expanded: true, prevComplete: true, itselfComplete: false,
    serviceAccountJson: null, serviceAccountError: null,
    setServiceAccountJson: vi.fn(), setServiceAccountError: vi.fn(),
    setStep2Complete: vi.fn(), setExpandedSteps: vi.fn(),
  };

  it('returns null when not expanded', () => {
    const { container } = render(<Step2 {...baseProps} expanded={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows lock message when prev not complete', () => {
    render(<Step2 {...baseProps} prevComplete={false} />);
    expect(screen.getByText(/complete step 1 first/i)).toBeInTheDocument();
  });

  it('shows completion state', () => {
    render(<Step2 {...baseProps} itselfComplete />);
    expect(screen.getByText(/service account configured/i)).toBeInTheDocument();
  });

  it('shows skip to manual VM link', () => {
    render(<Step2 {...baseProps} />);
    expect(screen.getByText(/skip to manual vm setup/i)).toBeInTheDocument();
  });

  it('shows confirmation text when serviceAccountJson is present', () => {
    render(<Step2 {...baseProps} serviceAccountJson={{ project_id: 'my-project' }} />);
    expect(screen.getByText(/paste service account json key/i)).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<Step2 {...baseProps} serviceAccountError="Invalid JSON" />);
    expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
  });
});

describe('Step3 - Project ID', () => {
  const baseProps = {
    expanded: true, prevComplete: true, stepComplete: false,
    projectId: '', serviceAccountJson: null,
    setProjectId: vi.fn(), setStep3Complete: vi.fn(),
    expandNextStep: vi.fn(), setError: vi.fn(),
  };

  it('returns null when not expanded', () => {
    const { container } = render(<Step3 {...baseProps} expanded={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows lock message when prev not complete', () => {
    render(<Step3 {...baseProps} prevComplete={false} />);
    expect(screen.getByText(/complete step 2 first/i)).toBeInTheDocument();
  });

  it('shows completion state with project ID', () => {
    render(<Step3 {...baseProps} stepComplete projectId="my-gcp-project" />);
    expect(screen.getByText(/project configured/i)).toBeInTheDocument();
    expect(screen.getByText(/my-gcp-project/)).toBeInTheDocument();
  });

  it('shows auto-fill suggestion from service account', () => {
    render(<Step3 {...baseProps} serviceAccountJson={{ project_id: 'sa-project' }} />);
    expect(screen.getByText('sa-project')).toBeInTheDocument();
    expect(screen.getByText(/use this/i)).toBeInTheDocument();
  });

  it('shows project ID input', () => {
    render(<Step3 {...baseProps} />);
    expect(screen.getByPlaceholderText('my-gcp-project-123')).toBeInTheDocument();
  });
});

describe('Step4 - Firebase Config', () => {
  const baseProps = {
    expanded: true, prevComplete: true, itselfComplete: false,
    firebaseConfigStaging: '', firebaseConfigProduction: '',
    firebaseStagingData: null, firebaseProductionData: null,
    setFirebaseConfigStaging: vi.fn(), setFirebaseConfigProduction: vi.fn(),
    handleSetupFirebase: vi.fn(),
  };

  it('returns null when not expanded', () => {
    const { container } = render(<Step4 {...baseProps} expanded={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows lock message when prev not complete', () => {
    render(<Step4 {...baseProps} prevComplete={false} />);
    expect(screen.getByText(/complete step 3 first/i)).toBeInTheDocument();
  });

  it('shows completion state with project IDs', () => {
    render(<Step4 {...baseProps} itselfComplete
      firebaseStagingData={{ projectId: 'stg-proj' }}
      firebaseProductionData={{ projectId: 'prod-proj' }}
    />);
    expect(screen.getByText(/firebase configured/i)).toBeInTheDocument();
    expect(screen.getByText(/stg-proj/)).toBeInTheDocument();
    expect(screen.getByText(/prod-proj/)).toBeInTheDocument();
  });

  it('shows both textarea inputs', () => {
    render(<Step4 {...baseProps} />);
    expect(screen.getAllByDisplayValue('')).toHaveLength(2);
  });

  it('shows Configure Firebase button', () => {
    render(<Step4 {...baseProps} />);
    expect(screen.getByText('Configure Firebase')).toBeInTheDocument();
  });
});

describe('Step5 - GitHub OIDC', () => {
  const baseProps = {
    expanded: true, prevComplete: true, itselfComplete: false,
    githubPat: '', setGithubPat: vi.fn(), setError: vi.fn(),
    githubApiFetch: vi.fn(), setGithubRepoName: vi.fn(),
    setupOidcInfrastructure: vi.fn(), uploadGitHubVars: vi.fn(),
    oidcSetupStatus: 'idle', oidcSetupStep: '',
    githubVarUploaded: false, githubRepoName: '',
    gcpSaStagingEmail: '', gcpSaProductionEmail: '',
    githubVarUploading: false, setExpandedSteps: vi.fn(),
    expandedSteps: [], error: null,
  };

  it('returns null when not expanded', () => {
    const { container } = render(<Step5 {...baseProps} expanded={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows lock message when prev not complete', () => {
    render(<Step5 {...baseProps} prevComplete={false} />);
    expect(screen.getByText(/complete step 4 first/i)).toBeInTheDocument();
  });

  it('shows completion state', () => {
    render(<Step5 {...baseProps} itselfComplete />);
    expect(screen.getByText(/github auth configured/i)).toBeInTheDocument();
  });

  it('shows PAT input', () => {
    render(<Step5 {...baseProps} />);
    expect(screen.getByPlaceholderText(/ghp_/)).toBeInTheDocument();
  });

  it('shows OIDC creating status', () => {
    render(<Step5 {...baseProps} oidcSetupStatus="creating" oidcSetupStep="Creating pool..." />);
    expect(screen.getByText('Creating pool...')).toBeInTheDocument();
  });

  it('shows OIDC done status with repo info', () => {
    render(<Step5 {...baseProps} oidcSetupStatus="done" githubVarUploaded
      githubRepoName="owner/repo" gcpSaStagingEmail="stg@sa"
      gcpSaProductionEmail="prod@sa"
    />);
    expect(screen.getByText(/oidc configured/i)).toBeInTheDocument();
    expect(screen.getByText(/stg@sa/)).toBeInTheDocument();
    expect(screen.getByText(/prod@sa/)).toBeInTheDocument();
  });

  it('shows OIDC error status', () => {
    render(<Step5 {...baseProps} oidcSetupStatus="error" oidcSetupStep="Access denied" />);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<Step5 {...baseProps} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});

describe('Step6 - Discord Bot', () => {
  const baseProps = {
    expanded: true, prevComplete: true, itselfComplete: false,
    discordClientId: '', setDiscordClientId: vi.fn(),
    discordBotTokenInput: '', setDiscordBotTokenInput: vi.fn(),
    discordBotToken: '', discordInviteUrl: '', discordGuildId: '',
    setDiscordInviteUrl: vi.fn(),
    handleCreateDiscordBot: vi.fn(),
    discordDetecting: false, error: null,
  };

  it('returns null when not expanded', () => {
    const { container } = render(<Step6 {...baseProps} expanded={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows lock message when prev not complete', () => {
    render(<Step6 {...baseProps} prevComplete={false} />);
    expect(screen.getByText(/complete step 5 first/i)).toBeInTheDocument();
  });

  it('shows completion state', () => {
    render(<Step6 {...baseProps} itselfComplete />);
    expect(screen.getByText(/discord bot configured/i)).toBeInTheDocument();
  });

  it('shows token input', () => {
    render(<Step6 {...baseProps} />);
    expect(screen.getByPlaceholderText(/MTE4/)).toBeInTheDocument();
  });

  it('shows invite URL when generated', () => {
    render(<Step6 {...baseProps} discordInviteUrl="https://discord.com/oauth2/authorize?client_id=123" />);
    const link = screen.getByRole('link', { name: /https:\/\/discord\.com/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://discord.com/oauth2/authorize?client_id=123');
  });

  it('shows error message', () => {
    render(<Step6 {...baseProps} error="Invalid token" />);
    expect(screen.getByText('Invalid token')).toBeInTheDocument();
  });

  it('shows Save Discord Bot button', () => {
    render(<Step6 {...baseProps} />);
    expect(screen.getByText('Save Discord Bot')).toBeInTheDocument();
  });
});

describe('Step7 - VM Creation', () => {
  const baseProps = {
    expanded: true, prevComplete: true,
    isVmComplete: false, showRecreateOptions: false,
    vmIp: '', vmZone: 'us-east1-b', setVmZone: vi.fn(),
    vmMachineType: 'e2-micro', setVmMachineType: vi.fn(),
    useOptimizedBundle: false, setUseOptimizedBundle: vi.fn(),
    creatingVm: false, deletingVm: false,
    step4Status: 'idle', step4Message: '', step4Logs: [],
    handleCreateVm: vi.fn(), handleDeleteVm: vi.fn(),
    setShowRecreateOptions: vi.fn(),
    vmLogs: '', loadingVmLogs: false, refreshVmLogs: vi.fn(),
    vmHttpsUrl: '',
  };

  it('returns null when not expanded', () => {
    const { container } = render(<Step7 {...baseProps} expanded={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows lock message when prev not complete', () => {
    render(<Step7 {...baseProps} prevComplete={false} />);
    expect(screen.getByText(/complete step 6 first/i)).toBeInTheDocument();
  });

  it('shows VM complete state with IP and serial logs', () => {
    render(<Step7 {...baseProps} isVmComplete vmIp="1.2.3.4" />);
    expect(screen.getByText(/vm created and ready/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.2\.3\.4/)).toBeInTheDocument();
    expect(screen.getByText(/serial port logs/i)).toBeInTheDocument();
  });

  it('shows recreate and delete buttons when VM is complete', () => {
    render(<Step7 {...baseProps} isVmComplete vmIp="1.2.3.4" />);
    expect(screen.getByText('Recreate VM')).toBeInTheDocument();
    expect(screen.getByText('Delete VM')).toBeInTheDocument();
  });

  it('shows Zone and Machine Type selects', () => {
    render(<Step7 {...baseProps} />);
    expect(screen.getByText(/gcp zone/i)).toBeInTheDocument();
    expect(screen.getByText(/machine type/i)).toBeInTheDocument();
  });

  it('shows optimized bundle checkbox', () => {
    render(<Step7 {...baseProps} />);
    expect(screen.getByText(/use optimized deployment/i)).toBeInTheDocument();
  });

  it('shows enabling status with logs', () => {
    const logs = [{ time: '10s', message: 'Creating VM...' }];
    render(<Step7 {...baseProps} step4Status="enabling" step4Message="Enabling APIs..." step4Logs={logs} />);
    expect(screen.getByText(/enabling APIs/i)).toBeInTheDocument();
    expect(screen.getByText('Creating VM...')).toBeInTheDocument();
  });

  it('shows error status', () => {
    render(<Step7 {...baseProps} step4Status="error" step4Message="Quota exceeded" />);
    expect(screen.getByText(/vm creation failed/i)).toBeInTheDocument();
    expect(screen.getByText('Quota exceeded')).toBeInTheDocument();
  });

  it('shows Create VM button text', () => {
    render(<Step7 {...baseProps} />);
    expect(screen.getByText(/enable apis & create vm/i)).toBeInTheDocument();
  });
});
