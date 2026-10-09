import type { FireDecision, Maybe, Tick, TickToSend } from './types';

export const CONTENT_TYPE: 'application/sylk-addressbook-update';
export const PAYLOAD_VERSION: number;
export const NOTIFY_DEBOUNCE: number;
export const NOTIFY_MAX_DEFER: number;
export const NOTIFY_MIN_INTERVAL: number;
export const NOTIFY_FUSE_MAX: number;
export const NOTIFY_FUSE_WINDOW: number;
export const ID_LIST_CAP: number;
export const FETCH_JITTER_MIN: number;
export const FETCH_JITTER_MAX: number;
export const FETCH_MIN_INTERVAL: number;
export const FETCH_FUSE_MAX: number;
export const FETCH_FUSE_WINDOW: number;
export const FETCH_BACKOFF: number[];
export const FRESHNESS_WINDOW: number;

export function nowSeconds(): number;

export interface BuildTickOptions {
    origin?: string;
    contactIds?: Maybe<Array<string | number | null | undefined>>;
    groupIds?: Maybe<Array<string | number | null | undefined>>;
    truncated?: boolean;
    // seconds
    timestamp?: number;
}

// The JSON body. A truncated tick carries no id lists ("unknown, assume everything").
export function buildTick(options?: BuildTickOptions): string;
// null for anything that is not a v1 tick.
export function parseTick(text: string): Tick | null;
// Checked on arrival, never again when the jitter expires.
export function isFresh(timestamp: unknown, nowSec?: number, windowSec?: number): boolean;
export function jitterDelay(rand?: () => number): number;

export interface ClockOptions {
    now?: () => number;
}

// Accumulates a burst and answers: may we send yet, and with what?
export class SendThrottle {
    constructor(options?: ClockOptions);
    suppress(): void;
    resume(): void;
    readonly suppressed: boolean;
    // False when suppressed (nothing noted).
    note(kind: 'contact' | 'group', id?: string | number | null): boolean;
    noteContact(id?: string | number | null): boolean;
    noteGroup(id?: string | number | null): boolean;
    readonly pending: boolean;
    // ms until a tick may go out, or null when nothing is pending.
    delay(): number | null;
    // The tick to send now, or null (not due, not settled, or the fuse is blown). Pass settled=false while a write is in flight.
    take(settled?: boolean): TickToSend | null;
    readonly fuseBlown: boolean;
}

// Jitter, coalescing and backoff of the refetch.
export class FetchScheduler {
    constructor(options?: ClockOptions & { rand?: () => number });
    readonly armed: boolean;
    readonly inFlight: boolean;
    // ms until to fetch, or null when one is already armed or in flight.
    schedule(): number | null;
    fire(settled?: boolean): FireDecision;
    // The fetch is answered. A delay when one more was asked for meanwhile, else null.
    done(): number | null;
    reset(): void;
}
