'use client';

import { Button } from '@/components/ui/button';
import { useSkinSelection } from '@/components/skins/SkinContext';
import { useThemeSwitcher } from '@/components/ThemeProvider';
import { SourceAction } from '@/components/skins/enochian/ReceiverControls';

/** Functional adapter; Enochian's authored cap/socket/spring remain untouched. */
export function DesktopAction({ label, ariaLabel, onClick, disabled, submit = false }: {
  label: string; ariaLabel?: string; onClick?: () => void; disabled?: boolean; submit?: boolean;
}) {
  const skin = useSkinSelection();
  const themes = useThemeSwitcher();
  if (skin?.effectiveId === 'classic') return <Button type={submit ? 'submit' : 'button'} aria-label={ariaLabel} variant="outline" disabled={disabled} onClick={onClick}>{label}</Button>;
  return <SourceAction label={label} ariaLabel={ariaLabel} disabled={disabled} submit={submit} onClick={onClick}
    finish={themes?.effectiveId === 'enochian-obsidian' ? 'obsidian' : 'ivory'} />;
}
