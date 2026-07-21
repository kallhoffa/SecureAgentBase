import { createAuth } from '../lib/auth.js';
import { deleteVm } from '../lib/gcp.js';
import { loadConfig, clearConfig } from '../utils/config.js';
import { heading, info, success, warn } from '../utils/output.js';

export async function runDestroy(args: { yes?: boolean; saKey?: string }): Promise<void> {
  heading('Destroy SecureAgentBase');

  const config = loadConfig();
  if (!config.gcpProjectId) {
    warn('No deployment found.');
    return;
  }

  if (!args.yes) {
    const { confirm } = await (await import('inquirer')).default.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Delete VM in ${config.gcpProjectId}?`,
        default: false,
      },
    ]);
    if (!confirm) {
      info('Aborted');
      return;
    }
  }

  const auth = await createAuth(args.saKey);

  if (config.vmZone && config.vmIp) {
    info(`Deleting VM (${config.vmIp}) in ${config.vmZone}...`);
    await deleteVm(auth, config.gcpProjectId!, config.vmZone, 'secureagent-manager');
    success('VM deleted');
  }

  clearConfig();
  success('Configuration cleared');
}
