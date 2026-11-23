import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  packages: 'external',
  sourcemap: false,
  logLevel: 'info',
};

const targets = [
  {
    entry: 'api/_lib/authBackend.ts',
    outfile: 'api/_lib/authCore.cjs',
  },
  {
    entry: 'server/aiStatus.ts',
    outfile: 'api/_lib/aiStatusCore.cjs',
  },
  {
    entry: 'api/_lib/statusBackend.ts',
    outfile: 'api/_lib/statusCore.cjs',
  },
  {
    entry: 'api/_lib/aiExecEntry.ts',
    outfile: 'api/_lib/aiExecCore.cjs',
  },
];

await Promise.all(
  targets.map((item) =>
    esbuild.build({
      ...commonOptions,
      entryPoints: [path.join(rootDir, item.entry)],
      outfile: path.join(rootDir, item.outfile),
    })
  )
);
