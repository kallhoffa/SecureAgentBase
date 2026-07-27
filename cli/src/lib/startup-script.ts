// CLI startup script — auto-generated from shared/startup-script.sh
// Do not edit directly. Run `npm run generate` to regenerate.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const getStartupScript = (): string => {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(dir, 'startup-script.sh'), 'utf-8');
};
