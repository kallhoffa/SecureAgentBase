import { Anthropic } from '@anthropic-ai/sdk';
import { Octokit } from 'octokit';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const WORKING_BRANCH = process.env.WORKING_BRANCH || 'feat/ai-feature';

const SYSTEM_PROMPT = `You are The Architect, a senior software architect responsible for analyzing user requests and creating detailed specifications.

Your role:
1. Receive user prompts describing desired features
2. Create a non-executable \`specification.md\` file
3. Reject designs that violate security or sustainability principles

Security rules:
- Never suggest plain-text password storage
- Always use parameterized queries for databases
- Reject excessive API calls or loops

Output format:
- Use Markdown
- Include sections: Overview, Requirements, Technical Details, Acceptance Criteria`;

const CRITIC_PROMPT = `You are The Critic, an adversarial reviewer. Your job is to check specifications for:

1. Security vulnerabilities (plain-text secrets, SQL injection risks)
2. Sustainability issues (infinite loops, excessive API calls)
3. Architectural problems (tight coupling, missing error handling)

If issues found, respond with:
## Issues Found
- [Issue 1]
- [Issue 2]

If clean, respond with:
## Approved
The specification meets all standards.`;

const CODER_PROMPT = `You are The Coder, an expert developer. You implement specifications in the 4GB+ Cloud Run environment.

Rules:
- Use existing project conventions
- Write clean, tested code
- If tests fail, fix and retry once

Output:
- Create/modove files as needed
- Commit changes to the feature branch
- Run tests before committing`;

const VERIFIER_PROMPT = `You are The Verifier, a QA engineer. You run tests and validate implementations.

Actions:
- Run \`npm test\` or \`npm run build\`
- If tests fail, report errors to The Coder
- If tests pass, report success`;

class Brain {
  constructor() {
    this.anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
    this.octokit = GITHUB_TOKEN ? new Octokit({ auth: GITHUB_TOKEN }) : null;
    this.workingDir = '/tmp/repo';
  }

  async cloneRepo() {
    if (!this.octokit || !REPO_OWNER || !REPO_NAME) {
      throw new Error('GitHub credentials not configured');
    }

    const repoUrl = `https://${GITHUB_TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git`;
    
    execSync(`rm -rf ${this.workingDir}`);
    mkdirSync(this.workingDir, { recursive: true });
    
    execSync(`git clone ${repoUrl} .`, { cwd: this.workingDir });
    execSync(`git checkout -b ${WORKING_BRANCH}`, { cwd: this.workingDir });
  }

  async runArchitect(prompt) {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured');
    }

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const specContent = response.content[0].text;
    writeFileSync(join(this.workingDir, 'specification.md'), specContent);
    return specContent;
  }

  async runCritic(specContent) {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured');
    }

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: CRITIC_PROMPT,
      messages: [{ role: 'user', content: specContent }]
    });

    return response.content[0].text;
  }

  async runCoder(specContent) {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured');
    }

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: CODER_PROMPT,
      messages: [{ role: 'user', content: `Implement: ${specContent}` }]
    });

    return response.content[0].text;
  }

  async runVerifier() {
    try {
      execSync('npm run build', { cwd: this.workingDir, stdio: 'inherit' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async commitAndPush() {
    execSync('git add -A', { cwd: this.workingDir });
    execSync(`git commit -m "AI: Implement feature from specification"`, { cwd: this.workingDir });
    execSync(`git push -u origin ${WORKING_BRANCH}`, { cwd: this.workingDir });
  }

  async runPipeline(userPrompt) {
    console.log('Starting Multi-Agent Pipeline...');
    console.log(`User prompt: ${userPrompt}`);

    await this.cloneRepo();
    console.log('✓ Repository cloned');

    const specContent = await this.runArchitect(userPrompt);
    console.log('✓ Specification created');

    const criticResult = await this.runCritic(specContent);
    if (criticResult.includes('Issues Found')) {
      console.log('✗ Critic rejected specification');
      return { status: 'rejected', issues: criticResult };
    }
    console.log('✓ Specification approved');

    await this.runCoder(specContent);
    console.log('✓ Implementation complete');

    const verifyResult = await this.runVerifier();
    if (!verifyResult.success) {
      console.log('✗ Verification failed, notifying coder');
      return { status: 'retry', error: verifyResult.error };
    }
    console.log('✓ Verification passed');

    await this.commitAndPush();
    console.log('✓ Changes pushed to branch');

    return { status: 'success', branch: WORKING_BRANCH };
  }
}

const brain = new Brain();
const input = process.argv[2] || process.stdin;

if (input && typeof input === 'string') {
  brain.runPipeline(input).catch(console.error);
}

export { Brain };
