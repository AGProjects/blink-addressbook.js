import type { GroupKind, LocalContactLike, Maybe, PstnRules, Rules, RulesContext, ServerGroup } from './types';

// The rules bound to one account. The context is read at call time.
export function create(context?: Maybe<RulesContext>): Rules;

// ---- phone numbers, independent of the account
export function stripTelScheme(uri: string): string;
// The match array (truthy) or null, as it always has: test it for truth, not for identity with true.
export function isPhoneNumber(uri: string, conferenceDomain?: string): RegExpMatchArray | null;
export function pstnWireUriToE164(uri: string, rules?: Maybe<PstnRules>): string;
export function stripTrunkZeroAfterCountryCode(uri: string, rules?: Maybe<PstnRules>): string;
export function applyLeadingZeroRule(username: string, rules?: Maybe<PstnRules>): string;

// ---- addresses, independent of the account
export function uriUsername(uri?: Maybe<string>): string;
export function isLocalDomain(uri?: Maybe<string>): boolean;
export function isIpDomain(uri?: Maybe<string>): boolean;
export function swapDomain(uri: string, fromDom: string, toDom: string): string;
export function localContactUris(contact: Maybe<LocalContactLike>): string[];

// ---- groups
export const NON_GROUP_TAGS: Set<string>;
export const DYNAMIC_LOCAL_GROUPS: Set<string>;
export const AUTO_LOCAL_GROUPS: Set<string>;
export const GROUP_KINDS: Record<GroupKind, GroupKind>;
export const TAG_FOR_KIND: Record<GroupKind, string>;
export const RESERVED_ID_FOR_KIND: Record<GroupKind, string>;
export const RESERVED_GROUP_KEYS: Record<string, string>;
export function capitalizeGroup(name?: Maybe<string>): string;
export function tagToGroupName(tag?: Maybe<string>): string;
export function groupNameToTag(name?: Maybe<string>): string;
export function isPurgeGroup(name?: Maybe<string>): boolean;
export function isPurgeTag(tag?: Maybe<string>): boolean;
// '' when the group carries no kind.
export function groupKind(group: Maybe<ServerGroup>): string;
export function groupKey(group: Maybe<ServerGroup>): string;
export function tagForGroup(group: Maybe<ServerGroup>): string;
export function groupIsShared(group: Maybe<ServerGroup>): boolean;
export function isDeviceLocalGroup(key: string, group: Maybe<ServerGroup>): boolean;
export function isDeviceLocalName(key: string): boolean;
// 'id' followed by digits, as the server writes them.
export function generateServerId(): string;
