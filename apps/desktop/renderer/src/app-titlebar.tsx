import { useEffect, useState } from 'react';
import { Button, makeStyles, mergeClasses } from '@fluentui/react-components';
import { palette } from './theme';
import { CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from './window-icons';
import appMark from '../../resources/branding/cs2-analyst-mark.png';

const useStyles = makeStyles({
  bar: {
    flexShrink: 0, zIndex: 100, height: '40px', boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: palette.pageBottom, borderBottom: `1px solid ${palette.rowDivider}`,
    userSelect: 'none', WebkitAppRegion: 'drag',
  },
  identity: { display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '14px', fontSize: '13px', fontWeight: 500 },
  logo: { display: 'flex', WebkitAppRegion: 'no-drag' },
  mark: { width: '20px', height: '20px', objectFit: 'contain' },
  controls: { display: 'flex', alignSelf: 'flex-start', height: '40px', WebkitAppRegion: 'no-drag' },
  control: {
    WebkitAppRegion: 'no-drag', minWidth: '46px', width: '46px', height: '40px',
    padding: 0, border: 0, borderRadius: 0, color: palette.textSecondary,
    backgroundColor: 'transparent',
    ':hover': { backgroundColor: palette.cardHover, color: palette.text },
    ':active': { backgroundColor: palette.raised },
    ':focus-visible': { outline: `1px solid ${palette.textMuted}`, outlineOffset: '-3px' },
  },
  close: { ':hover': { backgroundColor: '#c42b1c', color: '#ffffff' }, ':active': { backgroundColor: '#a92317', color: '#ffffff' } },
});

export function AppTitlebar() {
  const s = useStyles();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let active = true;
    let notified = false;
    const unsubscribe = window.cs2Analyst.window.onMaximizedChange(value => {
      notified = true;
      if (active) setMaximized(value);
    });
    // Subscribe first; a delayed initial response must not overwrite a newer native event.
    void window.cs2Analyst.window.isMaximized().then(value => {
      if (active && !notified) setMaximized(value);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  // Chromium's native drag region owns dragging and double-click maximize/restore.
  return <header data-app-titlebar className={s.bar}>
    <div className={s.identity}><span className={s.logo}><img data-app-logo className={s.mark} src={appMark} alt="" draggable={false} /></span><span>CS2 Analyst</span></div>
    <div className={s.controls}>
      <Button appearance="transparent" className={s.control} data-window-control="minimize" aria-label="最小化" icon={<MinimizeIcon />} onClick={() => void window.cs2Analyst.window.minimize()} />
      <Button appearance="transparent" className={s.control} data-window-control="maximize" aria-label={maximized ? '还原' : '最大化'} icon={maximized ? <RestoreIcon /> : <MaximizeIcon />} onClick={() => void window.cs2Analyst.window.toggleMaximize()} />
      <Button appearance="transparent" className={mergeClasses(s.control, s.close)} data-window-control="close" aria-label="关闭" icon={<CloseIcon />} onClick={() => void window.cs2Analyst.window.close()} />
    </div>
  </header>;
}
