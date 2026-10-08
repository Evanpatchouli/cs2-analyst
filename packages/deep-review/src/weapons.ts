import type { ContactSourceKind } from "./contracts.js";

// Domain identifiers only; never use Renderer assets or native display names as truth.
const firearms = new Set([
  "ak47", "aug", "awp", "bizon", "cz75a", "deagle", "elite", "famas", "fiveseven",
  "g3sg1", "galilar", "glock", "hkp2000", "m249", "m4a1", "m4a1_silencer", "mac10",
  "mag7", "mp5sd", "mp7", "mp9", "negev", "nova", "p250", "p90", "revolver",
  "sawedoff", "scar20", "sg556", "ssg08", "tec9", "ump45", "usp_silencer", "xm1014",
]);
const utility = new Set([
  "hegrenade", "inferno", "molotov", "incgrenade", "flashbang", "smokegrenade", "decoy",
  "planted_c4", "c4", "bomb", "bomb_explosion",
]);

export function classifyContactWeapon(weapon?: string): ContactSourceKind | "utility" {
  // Preserve the original in the contact; normalize only for classification.
  const identifier = weapon?.toLowerCase().replace(/^weapon_/, "");
  if (!identifier) return "unknown";
  if (utility.has(identifier)) return "utility";
  if (identifier === "knife" || identifier.startsWith("knife_") || identifier === "bayonet") return "melee";
  if (identifier === "taser") return "taser";
  return firearms.has(identifier) ? "firearm" : "unknown";
}
