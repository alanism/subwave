// Library settings are user data; the audio catalog is a disposable index.
// Preserve damaged settings before rebuilding, and never replace a file that
// could not be read or safely copied. Playback can still use the audio index.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomicSync } from '../../controller/src/util/atomic-file.js';

type LoadedLibrary = { value: Record<string, unknown>; warning: string | null; writeBlocked: string | null };
const empty = (): LoadedLibrary => ({ value: {}, warning: null, writeBlocked: null });

export async function readSavedLibrary(stateDir: string): Promise<LoadedLibrary> {
  let contents: Buffer;
  try { contents = await readFile(join(stateDir, 'library.json')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty();
    const warning = 'Saved library settings could not be read. The file is kept; playlist and preset changes are blocked. Repair its permissions or restore your backup, then restart Subwave.';
    return { value: {}, warning, writeBlocked: warning };
  }
  try {
    const value: unknown = JSON.parse(contents.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved library');
    return { ...empty(), value: value as Record<string, unknown> };
  } catch {
    const name = `library-recovery-${randomUUID()}.json`;
    try {
      // Publish and sync the recovery copy before allowing the ordinary
      // settings writer to replace the damaged original. Never replace a copy.
      writeFileAtomicSync(join(stateDir, name), contents, { mode: 0o600, durable: true, replace: false });
      return { value: {}, writeBlocked: null, warning: `Saved library settings were damaged. Their original contents are preserved as ${name} in the local-station folder beside your saved settings. Your audio files are kept.` };
    } catch {
      const warning = 'Saved library settings were damaged and a recovery copy could not be saved. The original file is kept; playlist and preset changes are blocked. Restore your backup or repair the folder permissions, then restart Subwave.';
      return { value: {}, warning, writeBlocked: warning };
    }
  }
}
