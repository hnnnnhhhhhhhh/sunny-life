import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const candidates = [
  process.env.BLENDER_BIN,
  resolve(root, '.runtime/Blender.app/Contents/MacOS/Blender'),
  '/Applications/Blender.app/Contents/MacOS/Blender',
  'blender',
].filter(Boolean);
const blender = candidates.find(binary => spawnSync(binary, ['--version'], { stdio: 'ignore', timeout: 15000 }).status === 0);
if (!blender) {
  console.error('Blender not found. Install Blender 4.5+ or set BLENDER_BIN to its executable.');
  process.exit(1);
}
const kind = process.argv.includes('--resident') ? 'resident' : process.argv.includes('--world') ? 'world' : 'furniture';
const source = resolve(root, `art/blender/sunny-${kind}.blend`);
const rebuild = process.argv.includes('--rebuild');
if (!rebuild && !existsSync(source)) {
  console.error('No .blend source found. Run npm run models:rebuild first.');
  process.exit(1);
}
const args = ['--background'];
if (!rebuild) args.push(source);
args.push('--python-exit-code', '1', '--python', resolve(root, `art/blender/build_${kind}.py`), '--', '--output', root);
if (!rebuild) args.push('--export-only');
console.log(rebuild ? 'Rebuilding the generated .blend source and GLB models.' : 'Exporting GLB models from the existing .blend source; manual edits are preserved.');
const result = spawnSync(blender, args, { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
