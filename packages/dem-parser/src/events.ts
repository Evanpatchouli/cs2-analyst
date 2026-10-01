export type DemoEventType =
  | "kill"
  | "damage"
  | "weapon_fire"
  | "utility"
  | "position";

export interface RawDemoEvent {
  type: DemoEventType;
  tick: number;
}
