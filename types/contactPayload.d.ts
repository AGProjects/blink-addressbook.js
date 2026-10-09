import type { ContactPayload, Maybe, Rules, ServerContact, UriEntry } from './types';

export interface ForServerOptions {
    // An automatic write: an echo of the address in `contact` does not replace a real name in `existing`.
    keepRealName?: boolean;
    // The id for a new address (default: addressbookRules.generateServerId; pass your own for predictable ids).
    newId?: () => string;
}

// What a contact looks like on the server. `contact` is what the caller built, `existing` the server's current
// copy of the same id (or null). Returns a copy; nothing client-local (identity, key, ...) is in it.
export function forServer(contact: ServerContact, existing: Maybe<ServerContact>, rules: Rules, options?: ForServerOptions): ContactPayload;

// Every spelling a name could echo.
export function echoSpellings(rules: Rules, lists: Array<Maybe<Array<UriEntry | string | null | undefined>>>): string[];
// The name this contact should have when its name is only its address, or null.
export function nameReplacement(name: Maybe<string>, addresses: Maybe<string[]>, rules: Rules): string | null;
// The cached display name for a contact that has no real name of its own, or ''.
export function cachedRealName(
    contact: Maybe<Pick<ServerContact, 'name' | 'uris' | 'defaultUri'>>,
    contactCache: Maybe<{ size: number; get(uri: string): unknown }>,
    rules: Rules
): string;
// Whether a display name that arrived with a message may name this contact: only into a hole, only a real name.
export function adoptsDisplayName(
    contact: Maybe<Pick<ServerContact, 'name' | 'uris' | 'defaultUri'>>,
    displayName: unknown,
    senderUri: Maybe<string>,
    rules: Rules
): boolean;
