// A narrow optional bridge supplied by the installed desktop shell. The web
// edition has no bridge and keeps its existing behaviour.
export type DesktopPanel = 'youtube' | 'library' | 'stations' | 'settings';
export type DesktopCommand = 'open-files' | 'new-playlist' | 'toggle-playback' | 'next' | 'toggle-mute';
export type DesktopAgentAction = 'status' | 'play-track' | 'play-source' | 'play-download' | 'stop' | 'next' | 'set-volume';
export interface DesktopImportProgress { completed: number; total: number; name: string }
export interface DesktopPlayer {
  skin(): Promise<'classic' | 'enochian'>;
  skinChanged(skin: string): void;
  onSkin(callback: (skin: 'classic' | 'enochian') => void): () => void;
  openFiles(stationId?: string): Promise<{ cancelled: boolean; imported: number; errors: string[] }>;
  openMusicFolder(): Promise<void>;
  onPanel(callback: (panel: DesktopPanel | null) => void): () => void;
  onCommand?(callback: (command: DesktopCommand) => void): () => void;
  onAgentCommand?(callback: (action: DesktopAgentAction, args: Record<string, unknown>) => Promise<unknown>): () => void;
  initialPanel(): Promise<DesktopPanel | null>;
  onImportProgress?(callback: (progress: DesktopImportProgress) => void): () => void;
}
declare global {
  interface Window { desktopPlayer?: DesktopPlayer }
}
export const DESKTOP_EDITION = process.env.NEXT_PUBLIC_SUBWAVE_DESKTOP === '1';
