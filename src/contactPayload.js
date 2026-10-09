'use strict';

/*
 * The one place a contact is turned into what goes to the server.
 *
 * Pure: the rules, the previous (server) copy and the id generator all come in
 * as arguments, so it runs the same in a test as in the app. The app installs
 * forServer() as sylkrtc's write filter (addressbookWriteFilter.js), so every
 * contact write -- the provider's add and update, the offline queue, the
 * cached-name rename, the contact editor, "set as default" -- passes through it.
 * The rules are sylk-mobile's
 * (_abServerContactPayload) and the addressbook spec's
 * (docs/addressbook/addressbook.md in sylk-mobile, Chapters 3, 15, 16.4, 19):
 *
 *   - addresses are canonical: a phone number is bare +E.164, a conference
 *     room is stored under conference.X, everything else lowercase
 *     (addressbookRules localToServerUri);
 *   - the address list is replaced and de-duplicated by that value, never
 *     appended to;
 *   - a URI id the server already holds for an address is reused, so another
 *     client does not see a remove-and-add; a new address gets a server-style
 *     id ('id' + digits);
 *   - type is 'tel' or 'sip' for a SIP address (Chapter 19); other types a
 *     client wrote ('XMPP', ...) are kept, with their address untouched;
 *   - exactly one default, carried in defaultUri, the field the gateway reads;
 *   - a non-empty name, the address's username when there is nothing else;
 *   - dialog and presence carried through from the server copy, defaults only
 *     for a contact the server has never had;
 *   - the attributes bag merged over the server copy's, so keys this client
 *     does not know are never dropped;
 *   - nothing client-local (identity, key, message, _isNew) is sent;
 *   - a name that is only its own address is corrected by Blink's rule, below.
 *
 * Names follow Blink desktop's echoed_name_replacement (HistoryManager.py)
 * exactly, because a name one client rewrites and another does not is a name
 * the two disagree about. See nameReplacement(). In short: a conference room
 * is named by its room number; a name that is the contact's number in another
 * spelling ('0034913336701', '+31646630425@sylk.link') becomes the number; a
 * name that is an OLD spelling of the address ('foo@videoconference.X' on a
 * room now at conference.X) follows the address. A SIP contact whose name is
 * its own full address ('gogo@sylk.link') is left alone: its username is not
 * a better name, and on an account with 4444@sip2sip.info and
 * 4444@ag-projects.com it is a worse one ("a name has to be no worse after
 * this than before it").
 *
 * An empty name is written as the username: the server requires one.
 *
 * An automatic write (one made with a modified_reason: a conversation, an
 * incoming message, the name cache) never replaces a real name the server
 * holds with an echo. A user's own edit may: clearing a name in the editor
 * clears it.
 */

const addressbookRules = require('./addressbookRules');

const SIP_TYPES = new Set(['', 'sip', 'tel']);

function isSipType(type) {
    return type === undefined || type === null || SIP_TYPES.has(String(type).trim().toLowerCase());
}

function eventHandling(...candidates) {
    for (const src of candidates) {
        if (src && typeof src.policy === 'string' && src.policy) {
            return { policy: src.policy, subscribe: src.subscribe === true || src.subscribe === 'true' };
        }
    }
    return { policy: 'default', subscribe: false };
}

function isServerStyleId(id) {
    return typeof id === 'string' && /^id\d+$/.test(id);
}

// Every spelling a name could echo: the canonical addresses, the ones the
// caller and the server copy hold, and the local conference view of each.
function echoSpellings(rules, lists) {
    const out = new Set();
    for (const list of lists) {
        for (const u of (Array.isArray(list) ? list : [])) {
            const value = u && typeof u === 'object' ? u.uri : u;
            if (typeof value !== 'string' || !value.trim()) continue;
            out.add(value.trim().toLowerCase());
            try {
                out.add(rules.mangleConferenceDomainFromServer(value));
                out.add(rules.localToServerUri(value));
            } catch (e) { /* the raw spelling is still there */ }
        }
    }
    return [...out].filter(Boolean);
}

// Blink's echoed_name_replacement, over the contact's canonical addresses:
// the name this contact should have when its name is only its address, or
// null when there is nothing to change.
function nameReplacement(name, addresses, rules) {
    const n = String(name == null ? '' : name).trim();
    if (!n) return null;
    const list = (Array.isArray(addresses) ? addresses : []).map(a => String(a || '').trim()).filter(Boolean);
    if (list.length === 0) return null;
    const lowered = new Map(list.map(a => [a.toLowerCase(), a]));
    const lowerName = n.toLowerCase();

    // Blink also asks the macOS Address Book first for a non-room; this client
    // has no such book, so the address itself is the last resort.
    const replacement = (address) => {
        if (rules.isConferenceUri(address)) {
            const room = address.split('@')[0];
            return room && room !== n ? room : null;
        }
        return address !== n ? address : null;
    };
    const pstnE164 = (value) => {
        try {
            if (!addressbookRules.isPhoneNumber(value, rules.videoConfDomain())) return null;
            const e164 = rules.canonicalPstn(value);
            return /^\+\d{8,}$/.test(e164) ? e164 : null;
        } catch (e) {
            return null;
        }
    };

    // The name IS one of the addresses: a room becomes its number, anything
    // else keeps the address (only its case can change).
    if (lowered.has(lowerName)) return replacement(lowered.get(lowerName));

    // The name is the number in another spelling, and the address really is a
    // phone number (never an extension such as 1233@sylk.link).
    if (/\d/.test(lowerName)) {
        const nameE164 = pstnE164(lowerName);
        if (nameE164) {
            for (const address of lowered.values()) {
                if (pstnE164(address) === nameE164) return replacement(address);
            }
        }
    }

    // Otherwise a name only counts as an address if it looks like one.
    if (lowerName.indexOf('@') === -1) return null;
    const localPart = lowerName.split('@')[0];
    if (!localPart) return null;

    // The address is stored bare: '+3161...@sylk.link' against '+3161...'.
    if (lowered.has(localPart)) return replacement(lowered.get(localPart));

    // The address kept a domain, and the name is the same party under an older
    // one: '338318@videoconference.sip2sip.info' against '338318@conference...'.
    for (const [lowerAddress, address] of lowered) {
        if (lowerAddress.split('@')[0] === localPart) return replacement(address);
    }
    return null;
}

/*
 *   contact   what the caller built (a server contact, possibly edited)
 *   existing  the server's current copy of the same id, or null
 *   rules     addressbookRules bound to the account (addressbookAccountRules)
 *   options   { keepRealName }: true for an automatic write -- an echo in
 *             `contact` does not replace a real name in `existing`
 *             { newId }: () => string, the id for a new address (default:
 *             addressbookRules.generateServerId, which reads the clock and
 *             random numbers; pass your own to get predictable ids)
 */
function forServer(contact, existing, rules, options = {}) {
    if (!contact || typeof contact !== 'object') return contact;
    const newId = typeof options.newId === 'function' ? options.newId : addressbookRules.generateServerId;
    const serverUri = (u) => rules.localToServerUri(u);
    const key = (u) => String(u || '').trim().toLowerCase();

    // URI ids the server already holds, by canonical address.
    const serverIds = new Map();
    for (const e of (existing && Array.isArray(existing.uris) ? existing.uris : [])) {
        if (!e || !e.id || !e.uri) continue;
        const k = isSipType(e.type) ? serverUri(e.uri) : key(e.uri);
        if (k && !serverIds.has(k)) serverIds.set(k, e);
    }

    const uris = [];
    const seen = new Set();
    let flagged = null;
    for (const u of (Array.isArray(contact.uris) ? contact.uris : [])) {
        if (!u || typeof u.uri !== 'string' || !u.uri.trim()) continue;
        const sip = isSipType(u.type);
        const value = sip ? serverUri(u.uri) : u.uri.trim();
        const k = sip ? value : key(value);
        if (!value || seen.has(k)) continue;
        seen.add(k);
        const known = serverIds.get(k);
        const entry = {
            id: (known && known.id) || (isServerStyleId(u.id) ? u.id : newId()),
            uri: value,
            type: sip ? rules.uriType(value) : String(u.type),
            attributes: (u.attributes && typeof u.attributes === 'object') ? u.attributes
                : ((known && known.attributes) || {}),
            default: false
        };
        uris.push(entry);
        if (u.default === true && !flagged) flagged = entry;
    }

    // The default: the entry flagged in the list, else the contact's
    // defaultUri, else the server copy's, else the best address (Chapter 5).
    const byAddress = (u) => {
        if (!u || !u.uri) return null;
        const k = isSipType(u.type) ? serverUri(u.uri) : key(u.uri);
        return uris.find(x => (isSipType(x.type) ? x.uri : key(x.uri)) === k) || null;
    };
    const def = flagged
        || byAddress(contact.defaultUri)
        || byAddress(existing && existing.defaultUri)
        || byAddress({ uri: rules.bestUri(uris.map(x => x.uri)) })
        || uris[0] || null;
    if (def) def.default = true;

    const primary = def ? def.uri : '';
    const spellings = echoSpellings(rules, [uris, contact.uris, [contact.defaultUri],
                                            existing && existing.uris, [existing && existing.defaultUri]]);
    const isEcho = (n) => rules.isUriEcho(n, spellings);
    const given = String(contact.name == null ? '' : contact.name).trim();
    const serverName = String((existing && existing.name) || '').trim();
    const username = addressbookRules.uriUsername(primary);
    let name;
    if (options.keepRealName && serverName && !isEcho(serverName) && isEcho(given)) {
        name = serverName;
    } else if (given) {
        name = nameReplacement(given, uris.map(u => u.uri), rules) || given;
    } else {
        name = username || primary || 'Unknown';
    }

    return {
        id: contact.id,
        name,
        uris,
        defaultUri: def ? { id: def.id, uri: def.uri, type: def.type, attributes: def.attributes, default: true } : undefined,
        dialog: eventHandling(existing && existing.dialog, contact.dialog),
        presence: eventHandling(existing && existing.presence, contact.presence),
        attributes: Object.assign({}, (existing && existing.attributes) || {}, contact.attributes || {})
    };
}

// The name the contact cache (display names seen on messages, keyed by the
// address they arrived from) holds for a contact that has no real name of its
// own. '' when the contact already has a real name, or the cache holds only
// echoes for every spelling of its addresses.
function cachedRealName(contact, contactCache, rules) {
    if (!contact || !contactCache || contactCache.size === 0) return '';
    const spellings = echoSpellings(rules, [contact.uris, [contact.defaultUri]]);
    if (!rules.isUriEcho(contact.name, spellings)) return '';
    const candidates = new Set();
    for (const u of [...(Array.isArray(contact.uris) ? contact.uris : []), contact.defaultUri]) {
        if (!u || typeof u.uri !== 'string') continue;
        candidates.add(u.uri);
        for (const v of rules.phoneNumberVariants(u.uri)) candidates.add(v);
    }
    for (const uri of candidates) {
        const name = String(contactCache.get(uri) || '').trim();
        if (name && !rules.isUriEcho(name, spellings)) return name;
    }
    return '';
}

// Whether a display name that arrived with a message may name this contact:
// only into a hole -- the contact has no real name -- and only with a real one.
function adoptsDisplayName(contact, displayName, senderUri, rules) {
    if (!contact || typeof displayName !== 'string' || !displayName.trim()) return false;
    const spellings = echoSpellings(rules, [contact.uris, [contact.defaultUri], [senderUri]]);
    return rules.isUriEcho(contact.name, spellings) && !rules.isUriEcho(displayName, spellings);
}

module.exports = { forServer, echoSpellings, nameReplacement, cachedRealName, adoptsDisplayName };
