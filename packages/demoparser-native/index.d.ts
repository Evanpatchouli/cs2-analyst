/// <reference types="node" />
// Native values stay opaque outside dem-parser's adapter. Signatures from v0.42.0.
export function parseHeader(input: string | Buffer): any;
export function parsePlayerInfo(input: string | Buffer): any;
export function parseEvents(input: string | Buffer, events?: string[], playerExtra?: string[], otherExtra?: string[], gameEventListBytes?: Buffer): any;
export function parseEvent(input: string | Buffer, event: string, playerExtra?: string[], otherExtra?: string[]): any;
export function parseTicks(input: string | Buffer, props: string[], ticks?: number[], players?: string[], structOfArrays?: boolean, orderBySteamid?: boolean, propStates?: any[]): any;
export function parseGrenades(input: string | Buffer, extra?: string[], grenades?: boolean): any;
export function listGameEvents(input: string | Buffer): any;
export function listUpdatedFields(input: string | Buffer): any;
export function getBindingProvenance(): { bindingPath: string; verifiedSha256: string; source: Record<string, unknown>; target: string; binary: { filename: string; sha256: string } };
