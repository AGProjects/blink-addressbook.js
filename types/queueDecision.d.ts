import type { Maybe, QueueDecision, QueueOperation, Rules, ServerContact } from './types';

// What to record with an operation when it is queued: the fingerprint of the copy the app holds of the contact now
// (null when there is none). Read it BEFORE the library call, which replaces its own copy at once.
export function baseFor(current: Maybe<ServerContact>, now?: () => number): { base: string | null; queuedAt: number };

// May a queued operation still be sent when it is replayed?
export function decide(
    operation: Maybe<QueueOperation>,
    context?: {
        // the server's copy of operation.contactId now, or null
        current?: Maybe<ServerContact>;
        // the contact index (has(uri) by any spelling), or null
        contacts?: Maybe<{ has(uri: string): boolean }>;
        rules?: Rules;
    }
): QueueDecision;
