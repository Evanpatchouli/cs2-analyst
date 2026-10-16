import React from 'react';
import { Body1, Button, Caption1, MessageBar, MessageBarBody, Title1, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { ImportIcon } from './icons';
import { palette } from './theme';

const useStyles = makeStyles({
  center: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px', overflowY: 'auto' },
  importCard: {
    backgroundColor: palette.card, border: `1px solid ${palette.border}`, borderRadius: tokens.borderRadiusLarge, boxShadow: 'none',
    width: 'min(520px, 100%)', padding: '48px 44px', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '14px',
    transitionProperty: 'border-color, background-color', transitionDuration: '160ms',
  },
  importCardActive: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: palette.raised },
  importIcon: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '72px', height: '72px', borderRadius: '50%', backgroundColor: palette.raised, color: palette.currentPlayer },
  muted: { color: tokens.colorNeutralForeground3 },
});

/** Home view: one central import card with both entry points, click and drag-and-drop. */
export function Home({ busy, onImport, onImportFile }: { busy: boolean; onImport: () => void; onImportFile: (filePath: string) => void }) {
  const s = useStyles();
  const [dragOver, setDragOver] = React.useState(false);
  const [dropError, setDropError] = React.useState<string | null>(null);
  const drop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    // A synthetic File (or one without a resolvable location) has no path; fall back to clicking.
    let filePath = '';
    try { filePath = window.cs2Analyst.getFilePath(file); } catch { filePath = ''; }
    if (!filePath) { setDropError('无法读取拖入文件的位置，请改用点击选择。'); return; }
    if (!filePath.toLowerCase().endsWith('.dem')) { setDropError('请选择 .dem 文件。'); return; }
    setDropError(null);
    onImportFile(filePath);
  };
  return <div className={s.center}>
    <div className={mergeClasses(s.importCard, dragOver && s.importCardActive)} data-import-card
      data-drag-over={dragOver ? 'true' : 'false'}
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; if (!dragOver) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={drop}>
      <span className={s.importIcon}><ImportIcon size={36} /></span>
      <Title1>从一场比赛开始</Title1>
      <Body1>选择一份 CS2 .dem 赛后录像，生成有证据的玩家表现报告与复盘重点。</Body1>
      {dropError ? <MessageBar intent="warning"><MessageBarBody>{dropError}</MessageBarBody></MessageBar> : null}
      <Button appearance="primary" size="large" icon={<ImportIcon size={18} />} disabled={busy} onClick={onImport}>选择 DEM 文件</Button>
      <Caption1 className={s.muted}>也可以把 .dem 文件直接拖放到这张卡片上 · 文件只在本机处理</Caption1>
    </div>
  </div>;
}
