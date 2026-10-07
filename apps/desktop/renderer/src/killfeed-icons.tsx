import { makeStyles } from '@fluentui/react-components';
import { killfeedDeathNoticeAssets, weaponAsset } from './killfeed-assets';

const useStyles = makeStyles({
  weapon: { display: 'block', height: '22px', width: 'auto', maxWidth: '96px', objectFit: 'contain', flexShrink: 0 },
  notice: { display: 'block', height: '22px', width: 'auto', maxWidth: '24px', objectFit: 'contain', flexShrink: 0 },
});

/** Neutral, non-weapon placeholder for absent/unknown identifiers and empty world assets. */
function GenericIcon({ kind = 'generic' }: { kind?: string }) {
  return <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" focusable="false" data-killfeed-icon={kind}>
    <circle cx="11" cy="11" r="5" stroke="currentColor" strokeWidth="1.5" />
  </svg>;
}

export function WeaponIcon({ weapon }: { weapon?: string }) {
  const s = useStyles();
  const src = weaponAsset(weapon);
  return src ? <img src={src} alt="" aria-hidden="true" className={s.weapon} data-killfeed-icon={weapon} /> : <GenericIcon kind={weapon === 'world' ? 'world' : 'generic'} />;
}
export function HeadshotIcon() {
  const s = useStyles();
  return <img src={killfeedDeathNoticeAssets.headshot} alt="" aria-hidden="true" className={s.notice} data-killfeed-icon="headshot" />;
}
export function FlashAssistIcon() {
  const s = useStyles();
  return <img src={killfeedDeathNoticeAssets.flashAssist} alt="" aria-hidden="true" className={s.notice} data-killfeed-icon="flash" />;
}

export const weaponLabels: Record<string, string> = {
  ak47: 'AK-47', m4a1: 'M4A4', m4a1_silencer: 'M4A1-S', awp: 'AWP', deagle: '沙漠之鹰', glock: 'Glock-18',
  usp_silencer: 'USP-S', hkp2000: 'P2000', p250: 'P250', fiveseven: 'FN 57', tec9: 'Tec-9', elite: '双持贝瑞塔',
  mp9: 'MP9', mac10: 'MAC-10', mp7: 'MP7', mp5sd: 'MP5-SD', ump45: 'UMP-45', p90: 'P90', bizon: 'PP-野牛',
  galilar: 'Galil AR', famas: 'FAMAS', sg556: 'SG 553', aug: 'AUG', ssg08: 'SSG 08', g3sg1: 'G3SG1',
  scar20: 'SCAR-20', nova: 'Nova', xm1014: 'XM1014', mag7: 'MAG-7', sawedoff: '截短霰弹枪', m249: 'M249',
  cz75a: 'CZ75-Auto', revolver: 'R8 左轮手枪', p2000: 'P2000', m4a1_silencer_off: 'M4A1-S（无消音器）', usp_silencer_off: 'USP-S（无消音器）',
  negev: '内格夫', taser: '电击枪', c4: 'C4', hegrenade: '高爆手雷', flashbang: '闪光弹',
  smokegrenade: '烟雾弹', molotov: '燃烧瓶', incgrenade: '燃烧弹', decoy: '诱饵弹',
  knife: '匕首', knife_t: '匕首', bayonet: '刺刀', knife_karambit: '爪子刀', knife_butterfly: '蝴蝶刀', inferno: '燃烧伤害', world: '坠落 / 世界伤害',
};
export const weaponLabel = (weapon: string) => weaponLabels[weapon] ?? weapon;
