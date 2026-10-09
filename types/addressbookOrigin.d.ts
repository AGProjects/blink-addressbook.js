import type { DocumentChange, Maybe, ServerContact, ServerGroup, Snapshot, StampKey, StampOptions, WriteKind } from './types';

export const STAMP_KEYS: readonly StampKey[];
export const SNAPSHOT_VERSION: number;

// What a contact says (name, addresses with type, dialog, presence), as a 16 character hash. The same function
// the offline queue uses for its `base`. Must stay byte-identical to Blink's.
export function contactFingerprint(contact?: Maybe<Pick<ServerContact, 'name' | 'uris' | 'dialog' | 'presence'>>): string;
export function groupFingerprint(group?: Maybe<Pick<ServerGroup, 'name' | 'contacts'>>): string;
export function fingerprintFor(kind: WriteKind): (item: any) => string;
// UTC, to the second: 2026-10-07T12:00:00Z
export function utcTimestamp(ms?: number): string;

// The payload that should go to the server: stamped with this device when it changes what the document says,
// else carrying the previous stamp through. Returns a copy; a non-object comes back as it is.
export function stampPayload<T>(kind: WriteKind, payload: T, previous: Maybe<object>, options?: StampOptions): T;

export function describeOrigin(item: Maybe<{ attributes?: Maybe<Record<string, unknown>> }>, fingerprint: (item: any) => string, thisDevice?: string): string;

// Compare a fetched addressbook against the snapshot of the last one. changes is null without a usable snapshot:
// the first document ever seen is a baseline, not additions.
export function diffDocument(
    addressbook: Maybe<{ contacts?: Maybe<ServerContact[]>; groups?: Maybe<ServerGroup[]> }>,
    previous: Maybe<Snapshot>,
    thisDevice?: string
): { changes: DocumentChange[] | null; snapshot: Snapshot };
export function formatChanges(changes: Maybe<DocumentChange[]>, cap?: number): string[];
// Accepts the JSON text or the object itself.
export function parseSnapshot(value: unknown): Snapshot | null;
