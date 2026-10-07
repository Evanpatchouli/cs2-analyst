/** Original, simplified monochrome silhouettes; no game assets or resource pack. */
const shapes = {
  rifle: 'M1 9h5l2-2h12v2h3v2h-9l-2 3h-3l-1-3H5l-2 2H1z',
  ak: 'M1 9h5l2-2h12v2h3v2h-9l2 5h-4l-2-5H5l-2 2H1z',
  silencedRifle: 'M1 9h5l2-2h9v1h7v3h-10l-2 3h-3l-1-3H5l-2 2H1z',
  scoped: 'M1 10h5l2-2h4V6h6v2h-2v1h8v2h-10l-2 3H8l-1-3H5l-2 2H1z',
  bullpup: 'M2 8h6V6h7v2h7v3h-9l-1 4H9v-3H5l-3 2z',
  pistol: 'M3 7h16v4h-8l-2 6H4l2-7H3z',
  silencedPistol: 'M2 7h12v1h9v3H10l-2 6H3l2-7H2z',
  dual: 'M1 5h10v3H7l-2 6H1l2-6H1z M13 10h10v3h-4l-2 6h-4l2-6h-2z',
  smg: 'M2 8h5V6h8v2h7v3h-9v5H9v-5H6l-1 3H2z',
  compact: 'M3 6h12v2h7v3h-8v6h-4v-6H7l-1 4H3z',
  p90: 'M2 7h15v2h6v3H12l-1 4H8v-4H2z M6 9v1h4V9z',
  shotgun: 'M1 9h6l2-1h14v3H12l-1 3H8l-1-3H5l-2 3H1z',
  machine: 'M1 8h7V6h9v2h6v3h-8v5H9v-5H5l-2 3H1z',
  grenade: 'M10 2h5v3h-2v2c5 1 6 5 5 9-1 5-11 5-12 0-1-4 0-8 4-9V5H8V3h2z',
  bottle: 'M10 2h4v7l4 5v6H6v-6l4-5z',
  fire: 'M13 1c3 5-1 7 2 10l2-4c6 8 3 15-5 15S2 14 6 9l2 4c-1-5 3-7 5-12z',
  knife: 'M2 18l7-7L21 2c0 7-4 11-10 12l-6 7z',
  taser: 'M3 6h15v4h-6l-2 7H5l2-7H3z M20 4l-3 4h3l-2 5 5-7h-3l2-2z',
  world: 'M12 2l10 18H2z M11 7h2v7h-2z M11 16h2v2h-2z',
  generic: 'M2 8h18v4h-8l-2 6H5l2-6H2z',
  headshot: 'M12 3a7 7 0 0 1 7 7v4l-3 2v4H8v-4l-3-2v-4a7 7 0 0 1 7-7z M8 9v3h3V9z M13 9v3h3V9z M11 14v2h2v-2z',
  flash: 'M13 1L5 13h6l-1 10 9-14h-6z',
} as const;

const weapons: Record<string, keyof typeof shapes> = {
  ak47: 'ak', m4a1: 'rifle', m4a1_silencer: 'silencedRifle', awp: 'scoped',
  deagle: 'pistol', glock: 'pistol', usp_silencer: 'silencedPistol', hkp2000: 'pistol',
  p250: 'pistol', fiveseven: 'pistol', tec9: 'compact', elite: 'dual',
  mp9: 'compact', mac10: 'compact', mp7: 'smg', mp5sd: 'silencedRifle', ump45: 'smg', p90: 'p90', bizon: 'smg',
  galilar: 'rifle', famas: 'bullpup', sg556: 'scoped', aug: 'bullpup', ssg08: 'scoped',
  g3sg1: 'scoped', scar20: 'scoped', nova: 'shotgun', xm1014: 'shotgun', mag7: 'compact', sawedoff: 'shotgun',
  m249: 'machine', negev: 'machine', taser: 'taser', hegrenade: 'grenade', molotov: 'bottle',
  incgrenade: 'grenade', inferno: 'fire', knife: 'knife', knife_t: 'knife', bayonet: 'knife',
  flashbang: 'grenade', smokegrenade: 'grenade', decoy: 'grenade', c4: 'compact', world: 'world',
};

function Silhouette({ kind }: { kind: keyof typeof shapes }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" data-killfeed-icon={kind}>
    <path fillRule="evenodd" d={shapes[kind]} />
  </svg>;
}

export function WeaponIcon({ weapon }: { weapon?: string }) {
  const kind = weapon && (weapons[weapon] ?? (weapon.startsWith('knife_') ? 'knife' : undefined));
  return <Silhouette kind={kind || 'generic'} />;
}
export const HeadshotIcon = () => <Silhouette kind="headshot" />;
export const FlashAssistIcon = () => <Silhouette kind="flash" />;

export const weaponLabels: Record<string, string> = {
  ak47: 'AK-47', m4a1: 'M4A4', m4a1_silencer: 'M4A1-S', awp: 'AWP', deagle: '沙漠之鹰', glock: 'Glock-18',
  usp_silencer: 'USP-S', hkp2000: 'P2000', p250: 'P250', fiveseven: 'FN 57', tec9: 'Tec-9', elite: '双持贝瑞塔',
  mp9: 'MP9', mac10: 'MAC-10', mp7: 'MP7', mp5sd: 'MP5-SD', ump45: 'UMP-45', p90: 'P90', bizon: 'PP-野牛',
  galilar: 'Galil AR', famas: 'FAMAS', sg556: 'SG 553', aug: 'AUG', ssg08: 'SSG 08', g3sg1: 'G3SG1',
  scar20: 'SCAR-20', nova: 'Nova', xm1014: 'XM1014', mag7: 'MAG-7', sawedoff: '截短霰弹枪', m249: 'M249',
  negev: '内格夫', taser: '电击枪', c4: 'C4', hegrenade: '高爆手雷', flashbang: '闪光弹',
  smokegrenade: '烟雾弹', molotov: '燃烧瓶', incgrenade: '燃烧弹', decoy: '诱饵弹',
  knife: '匕首', knife_t: '匕首', bayonet: '刺刀', knife_karambit: '爪子刀', knife_butterfly: '蝴蝶刀', inferno: '燃烧伤害', world: '坠落 / 世界伤害',
};
export const weaponLabel = (weapon: string) => weaponLabels[weapon] ?? weapon;
