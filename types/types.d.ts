/*
 * Types of the addressbook lib. The lib is plain JavaScript (CommonJS) and imports nothing from the app, so these
 * types stand on their own: the shapes below are what the lib reads and writes, not the app's own Contact type.
 * The app's types are assignable to them (the input types have no index signatures and every field is optional,
 * so a Contact with extra local fields such as identity or key passes).
 */

type Maybe<T> = T | null | undefined;

// ---- what a contact looks like -------------------------------------------------------------------

export interface UriEntry {
    id?: string;
    uri: string;
    type?: Maybe<string>;
    attributes?: Maybe<Record<string, unknown>>;
    default?: boolean;
}

// dialog / presence. XCAP gives text, JSON gives booleans: both are read.
export interface EventHandling {
    policy?: Maybe<string>;
    subscribe?: boolean | string | null;
}

// A contact as a caller builds it, or as the server holds it.
export interface ServerContact {
    id: string;
    name?: Maybe<string>;
    uris?: Maybe<UriEntry[]>;
    defaultUri?: Maybe<UriEntry>;
    dialog?: Maybe<EventHandling>;
    presence?: Maybe<EventHandling>;
    attributes?: Maybe<Record<string, unknown>>;
}

// What contactPayload.forServer returns: always complete.
export interface ContactPayload {
    id: string;
    name: string;
    uris: Array<Required<Pick<UriEntry, 'id' | 'uri' | 'type' | 'attributes' | 'default'>>>;
    defaultUri?: { id: string; uri: string; type: string; attributes: Record<string, unknown>; default: true };
    dialog: { policy: string; subscribe: boolean };
    presence: { policy: string; subscribe: boolean };
    attributes: Record<string, unknown>;
}

export interface ServerGroup {
    id?: string;
    name?: Maybe<string>;
    contacts?: Maybe<Array<string | { id: string | number }>>;
    attributes?: Maybe<Record<string, unknown>>;
}

// A contact of the app's own addressbook, as the rules see it (not the server's).
export interface LocalContactLike {
    uri?: string;
    uris?: string[];
}

export type GroupKind = 'calls' | 'tel' | 'blocked' | 'conference' | 'missed' | 'favorites';

// ---- rules ---------------------------------------------------------------------------------------

export interface PstnRules {
    replacePlus?: string;
    replaceLeadingZero?: string;
}

// Read at call time, field by field: an object with getters over live app state works.
export interface RulesContext {
    defaultDomain?: string;
    defaultConferenceDomain?: string;
    pstnRules?: PstnRules | null;
    onPstnCanon?: (from: string, to: string) => void;
}

// The rules bound to one account (createRules).
export interface Rules {
    phoneNumberVariants(uri: Maybe<string>): string[];
    videoConfDomain(): string;
    sipBridgeDomain(): string;
    mangleConferenceDomainFromServer(uri: string): string;
    mangleConferenceDomainToServer(uri: string): string;
    serverConferenceUri(uri: string): string;
    canonicalPstn(uri: string): string;
    normServerUri(uri: string): string;
    localToServerUri(uri: string): string;
    normalizeUri(uri: Maybe<string>): string;
    isConferenceUri(uri: Maybe<string>): boolean;
    isConferenceAnomaly(uri: Maybe<string>): boolean;
    // `uri` may be one address or a list; an echo of any of them counts.
    isUriEcho(name: Maybe<string>, uri: Maybe<string> | Array<Maybe<string>>): boolean;
    nameIsEcho(name: Maybe<string>, uri?: Maybe<string>): boolean;
    winningDisplayName(localName: Maybe<string>, serverName: Maybe<string>, uri: Maybe<string> | Array<Maybe<string>>): string;
    conferenceName(name: Maybe<string>, uri: string): string;
    bestUri(uris: Maybe<Array<Maybe<string>>>): string | null;
    chosenDefaultUri(contact: Maybe<{ defaultUri?: Maybe<{ uri?: string }>; default_uri?: Maybe<{ uri?: string }>; uris?: Maybe<UriEntry[]> }>): string | null;
    serverUris(contact: Maybe<{ defaultUri?: Maybe<{ uri?: string }>; default_uri?: Maybe<{ uri?: string }>; uris?: Maybe<UriEntry[]> }>): string[];
    uriType(uri: string): 'tel' | 'sip';
    contactQualifiesForTag(contact: Maybe<{ uri?: string }>, tag: Maybe<string>): boolean;
}

// ---- contact index -------------------------------------------------------------------------------

export interface IndexedContact {
    id: string | number;
    defaultUri?: Maybe<{ uri: string }>;
}

// Map-like, keys are canonical, get/has accept any spelling of an address.
//
// C is the app's own contact type. Say it where you can (`new ContactIndex<Contact>(rules)`) and get/best/values are
// typed. When nothing says it (a state type that is inferred from `new ContactIndex(rules)`), C is `any`, so the index
// fits whatever type the app gives its index. A minimal default would not: TypeScript would settle on it and the
// index would no longer be assignable to the app's own ContactIndex type.
export declare class ContactIndex<C extends IndexedContact = any> {
    constructor(rules: Pick<Rules, 'normServerUri'>);
    // Canonical key for any spelling of an address; '' when there is none.
    key(uri: Maybe<string>): string;
    add(uri: string, contact: C): void;
    // Among several owners: the one whose default address it is, else the lowest id.
    best(uri: Maybe<string>): C | null;
    get(uri: Maybe<string>): C[] | undefined;
    has(uri: Maybe<string>): boolean;
    readonly size: number;
    keys(): IterableIterator<string>;
    values(): IterableIterator<C[]>;
    entries(): IterableIterator<[string, C[]]>;
    forEach(callback: (value: C[], key: string, index: ContactIndex<C>) => void, thisArg?: unknown): void;
    [Symbol.iterator](): IterableIterator<[string, C[]]>;
}

// ---- notifications -------------------------------------------------------------------------------

export interface Tick {
    v: number;
    origin: string;
    timestamp: number;
    // null (not []) when the sender did not name them: "unknown, assume everything".
    contactIds: string[] | null;
    groupIds: string[] | null;
    truncated: boolean;
}

export interface TickToSend {
    contactIds: string[];
    groupIds: string[];
    truncated: boolean;
}

export interface FireDecision {
    fetch: boolean;
    retryIn?: number;
    backedOff?: boolean;
}

export type WriteKind = 'contact' | 'group';

export interface NotifierOptions {
    // The id of this device, also the stamps' modified_by. May return '' until it is known.
    deviceId?: () => string;
    log?: (line: string) => void;
    // Injected for a fake clock in a test; the defaults are the global timers.
    setTimeout?: (fn: () => void, ms: number) => unknown;
    clearTimeout?: (timer: any) => void;
    now?: () => number;
    rand?: () => number;
    // Send the tick to our OWN address (so it forks to our other devices). How it is sent is the caller's business.
    sendTick?: (payload: string) => void;
    // Refetch the addressbook; call done when the answer is in.
    fetch?: (done: (error?: unknown) => void) => void;
}

export declare class AddressbookNotifier {
    constructor(options?: NotifierOptions);
    // True when none of our own writes is still in flight.
    settled(): boolean;
    // Writes confirmed while suppressed are not announced (a repair is derived state). Calls nest.
    suppress(): void;
    resume(): void;
    // A write left for the server. Returns the callback to call when it is answered (with the error, if any).
    writeStarted(kind: WriteKind, id?: string | number | null): (error?: unknown) => void;
    // A tick from one of our own devices; the caller has checked the sender. True when it led to (or joined) a fetch.
    receive(message: Maybe<{ content?: string }>): boolean;
    dispose(): void;
}

// ---- queue ---------------------------------------------------------------------------------------

export type QueueOperationType = 'addContact' | 'updateContact' | 'deleteContact';

// An entry of the provider's offline queue, as far as queueDecision looks at it.
export interface QueueOperation {
    type: QueueOperationType;
    contactId: string;
    contactData?: ServerContact;
    // What the server held when the operation was queued (fingerprint), or null for nothing. Absent on entries
    // queued before it existed.
    base?: string | null;
    queuedAt?: number;
}

// send: still to do. applied: the server already says this. gone: the contact no longer exists. overtaken: the
// server copy changed after it was queued. exists: an add of an address another contact owns.
export type QueueDecision = 'send' | 'applied' | 'gone' | 'overtaken' | 'exists';

// ---- origin stamps -------------------------------------------------------------------------------

export type StampKey = 'modified_by' | 'modified_agent' | 'modified_at' | 'modified_reason' | 'modified_hash';

export interface StampOptions {
    deviceId?: string;
    agent?: string;
    reason?: string;
    // ms, for a test
    now?: number;
}

export interface Snapshot {
    v: number;
    // id -> [fingerprint, name]
    contacts: Record<string, [string, string]>;
    groups: Record<string, [string, string]>;
}

export interface DocumentChange {
    op: 'add' | 'update' | 'remove';
    kind: WriteKind;
    id: string;
    name: string;
    was: string | null;
    origin: string;
}
