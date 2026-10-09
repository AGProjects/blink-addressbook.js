'use strict';

/*
 * Whether a queued addressbook operation may still be sent when it is replayed.
 *
 * The provider queues an add, update or delete made before the addressbook is ready, keeps the queue on disk,
 * and replays it when the first document of the session loads. By then an entry can be hours or days old,
 * already applied, or overtaken by an edit on another device. Replaying it blindly writes an old contact over
 * the current one.
 *
 * Each queued operation therefore carries what the server held when it was queued:
 *
 *   base      contactFingerprint of that copy, or null when there was none
 *   queuedAt  ms
 *
 * and decide() compares it with what the server holds now:
 *
 *   send       not applied yet, and nothing changed underneath it
 *   applied    the server already says exactly this (an add: the contact exists)
 *   gone       an update or delete of a contact the server no longer has
 *   overtaken  the server copy changed after the operation was queued
 *   exists     an add of an address another contact already owns
 *
 * An entry queued before this existed has no `base`. Nothing can be said about it, so it is replayed as it
 * always was; only the 'applied', 'gone' and 'exists' checks, which need no base, still apply.
 *
 * Pure: it knows nothing of sylkrtc or of the app. The contact copies, the rules and the contact index come in
 * as arguments; the only things it requires are its two siblings, contactPayload and addressbookOrigin (whose
 * contactFingerprint is the one definition of "what a contact says", shared with the origin stamps).
 */

const { contactFingerprint } = require('./addressbookOrigin');
const { forServer } = require('./contactPayload');

// What to record with an operation when it is queued: `current` is the copy the app holds of the contact
// right now, or null. Read it BEFORE the library call: addContact, updateContact and deleteContact replace
// their own copy at once.
function baseFor(current, now = Date.now) {
    return { base: current ? contactFingerprint(current) : null, queuedAt: now() };
}

/*
 *   op        { type, contactId, contactData, base?, queuedAt? }
 *   current   the server's copy of op.contactId now, or null
 *   contacts  the contact index (has(uri) by any spelling), or null
 *   rules     addressbookRules bound to the account
 */
function decide(op, { current, contacts, rules } = {}) {
    if (!op || !op.type) return 'gone';
    const hasBase = op.base !== undefined;
    const changedSince = () => hasBase && op.base !== null && contactFingerprint(current) !== op.base;

    if (op.type === 'deleteContact') {
        if (!current) return 'gone';
        return changedSince() ? 'overtaken' : 'send';
    }

    if (op.type === 'addContact') {
        if (current) return 'applied';
        const uris = ((op.contactData && op.contactData.uris) || []).map(u => u && u.uri).filter(Boolean);
        if (contacts && uris.some(u => contacts.has(u))) return 'exists';
        return 'send';
    }

    if (op.type === 'updateContact') {
        if (!current) return 'gone';
        if (changedSince()) return 'overtaken';
        // Would the write change anything? The same payload the write filter will build. An entry with a base is
        // the user's own edit, so an echo in it is meant; one without a base is not known to be current, so it
        // never puts an echo over a real name (the provider replays it with keepRealName).
        try {
            const payload = forServer(op.contactData, current, rules, { keepRealName: !hasBase });
            if (contactFingerprint(payload) === contactFingerprint(current)) return 'applied';
        } catch (e) { /* cannot tell: send */ }
        return 'send';
    }

    return 'gone';
}

module.exports = { baseFor, decide };
