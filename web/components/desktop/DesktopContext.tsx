'use client';

import { createContext, useContext } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { DesktopLibrary } from '@/lib/schemas.generated';
import type { DesktopPanel } from '@/lib/desktop';
import type { LocalCommand } from './queries';

export interface DesktopSurfaceContext {
  panel: DesktopPanel | null;
  openPanel: (panel: DesktopPanel | null) => void;
  library: UseQueryResult<DesktopLibrary>;
  busy: boolean;
  pendingKind: LocalCommand['kind'] | null;
  importing: boolean;
  importDestination: string;
  setImportDestination: (stationId: string) => void;
  newPlaylistRequest: number;
  openFiles: (stationId?: string) => Promise<void>;
  run: (command: LocalCommand, success?: string) => Promise<unknown>;
  selectSource: (id: string, start?: boolean) => Promise<void>;
  playTrack: (id: string) => Promise<void>;
  playDownload: (id: string) => Promise<void>;
}
export const DesktopContext = createContext<DesktopSurfaceContext | null>(null);
export const useDesktopSurface = () => useContext(DesktopContext);
