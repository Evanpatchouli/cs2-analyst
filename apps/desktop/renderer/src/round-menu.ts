import { useCallback, useRef } from 'react';
import { makeStyles } from '@fluentui/react-components';

const useStyles = makeStyles({
  // Fluent positions the popup with inline max-height/height, so the cap must be
  // an author-important rule. 320px is the normal cap; the viewport term keeps the
  // popup compact if the application is ever hosted in a shorter window.
  listbox: {
    maxHeight: 'min(320px, calc(100vh - 96px)) !important',
    overflowY: 'auto',
  },
});

/**
 * Shared round-listbox behaviour. Fluent keeps focus, Enter, Escape and arrow-key
 * semantics; this hook adds the height cap and reveals the selected round on open.
 */
export function useRoundMenu() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxClassName = useStyles().listbox;
  const onOpenChange = useCallback((_event: unknown, data: { open: boolean }) => {
    if (!data.open) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const boxes = document.querySelectorAll<HTMLElement>('[role="listbox"]');
      const box = boxes[boxes.length - 1];
      box?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }));
  }, []);
  return {
    triggerRef,
    listboxClassName,
    positioning: { position: 'below' as const, align: 'start' as const, fallbackPositions: ['above'] as Array<'above'>, overflowBoundaryPadding: 8 },
    onOpenChange,
  };
}
