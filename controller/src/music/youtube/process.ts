// yt-dlp and ffmpeg are executed with argument arrays, never a shell. Caller
// URLs have already been reduced to canonical YouTube video IDs. No plugins,
// config files, browser cookies or remotely downloaded executables are enabled.
import { spawn } from 'node:child_process';

const runningCommands = new Set<() => void>();
// Station switching exits the controller; leave no detached downloader or
// FFmpeg writing into a queue which the next process is recovering.
process.once('exit', () => { for (const kill of runningCommands) kill(); });

export interface ProcessOptions {
  cwd?: string; timeoutMs?: number; onLine?: (line: string) => void;
  onSpawn?: (pid: number) => void; onExit?: (pid: number) => void;
}
export type RunProcess = (binary: string, args: string[], options?: ProcessOptions) => Promise<string>;
export const runProcess: RunProcess = (binary, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(binary, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
  child.once('spawn', () => { if (child.pid) options.onSpawn?.(child.pid); });
  child.once('close', () => { if (child.pid) options.onExit?.(child.pid); });
  const kill = () => {
    if (process.platform !== 'win32' && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } }
    else child.kill('SIGKILL');
  };
  runningCommands.add(kill);
  let stdout = '', stderr = '', pending = '', done = false;
  const finish = (error?: Error) => {
    if (done) return; done = true; clearTimeout(timer); runningCommands.delete(kill);
    if (error) reject(error); else resolve(stdout);
  };
  const timer = setTimeout(() => {
    kill(); finish(new Error('The download took too long. Try again.'));
  }, options.timeoutMs ?? 60_000);
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString(); pending += chunk.toString();
    if (Buffer.byteLength(stdout) > 8 * 1024 * 1024) { kill(); finish(new Error('YouTube returned too much metadata')); return; }
    let end: number;
    while ((end = pending.indexOf('\n')) !== -1) {
      options.onLine?.(pending.slice(0, end).trim()); pending = pending.slice(end + 1);
    }
  });
  child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000); });
  child.on('error', error => finish(new Error(`${binary} could not start: ${error.message}`)));
  child.on('close', code => finish(code === 0 ? undefined : new Error(stderr.trim().slice(-1200) || `${binary} exited with code ${code}`)));
});

export const YT_BASE_ARGS = ['--ignore-config', '--no-plugin-dirs', '--no-remote-components', '--no-cache-dir', '--js-runtimes', 'node', '--socket-timeout', '20', '--retries', '2'];
