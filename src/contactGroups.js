'use strict';

/*
 * The addressbook groups as a contacts list shows them, and the writes that
 * put a contact in or out of them.
 *
 * One entry per group key (rules.groupKey: kind, reserved id, or canonical
 * name), so two server groups that mean the same thing ("Friends" written by
 * two clients) are one filter. Pure: server groups come in, a plan of writes
 * goes out, and the app carries it out through its own library.
 */

const rules = require('./addressbookRules');

// The built-in groups: mobile's title and position in the category bar; custom groups follow, A to Z.
const BUILTIN = [
    ['messages', 'Messages'],
    ['calls', 'Calls'],
    ['favorites', 'Favorites'],
    ['tel', 'Tel'],
    ['missed', 'Missed'],
    ['blocked', 'Blocked'],
    ['conference', 'Conference']
];
const BUILTIN_TITLE = new Map(BUILTIN);

// Always offered in an editor, even before the account has the group.
const ALWAYS_OFFERED = ['favorites', 'blocked'];

// Filled by the clients themselves, from activity or from what an address is:
// an editor shows them but never changes them. Favorites and Blocked are the user's choice.
const LOCKED = new Set([...rules.AUTO_LOCAL_GROUPS, ...Object.keys(rules.GROUP_KINDS)]
    .filter(key => !ALWAYS_OFFERED.includes(key)));

const isLocked = key => LOCKED.has(key);
const keyForName = name => rules.groupKey({ name });   // a known name ("favorites", "Tel") is its built-in group
const titleForKey = key => BUILTIN_TITLE.get(key) || rules.capitalizeGroup(key);

// sylk-mobile's sanitizeTag: a group name may hold spaces, never commas or odd
// characters; a leading underscore is how reserved ids start, so not a name.
const sanitizeName = raw => String(raw == null ? '' : raw)
    .replace(/\s+/g, ' ')
    .replace(/[^A-Za-z0-9 _*-]/g, '')
    .trim()
    .replace(/^_+/, '')
    .trim();

const list = value => (Array.isArray(value) ? value : []);
const memberId = member => (typeof member === 'string' ? member : member && typeof member.id === 'string' ? member.id : '');
const rank = key => { const i = BUILTIN.findIndex(([builtin]) => builtin === key); return i < 0 ? BUILTIN.length : i; };

// [{ key, name, ids: [server group ids], members: Set<contactId>, count }], ordered.
// With `knownIds` (anything with has(id)) only contacts the app actually has
// count as members, so `count` is what the list can show.
function buildGroups(serverGroups, knownIds) {
    const byKey = new Map();
    for (const g of list(serverGroups)) {
        const key = g && !rules.isPurgeGroup(g.name) ? rules.groupKey(g) : '';
        if (!key) continue;
        if (!byKey.has(key)) {
            byKey.set(key, {
                key,
                name: BUILTIN_TITLE.get(key) || rules.capitalizeGroup(g.name || key),
                ids: [],
                members: new Set(),
                get count() { return this.members.size; }
            });
        }
        const entry = byKey.get(key);
        entry.ids.push(g.id);
        list(g.contacts).map(memberId).filter(id => id && (!knownIds || knownIds.has(id))).forEach(id => entry.members.add(id));
    }
    return [...byKey.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name));
}

/*
 * The writes that make `contact` a member of exactly the wanted groups:
 * [{ action: 'add' | 'update', group }], in the order to carry out.
 *
 *   wanted   { keys: keys of the groups it should be in,
 *              names: names of groups it should be in, created if missing }
 *   options  { newId } makes the id of a new group (default rules.generateServerId)
 *
 * Locked groups are never touched, whatever is asked. A key that several server
 * groups share gives the contact to the first and takes it from the others. A
 * wanted key no server group has yet is created: with its kind and reserved id
 * when it is a kind (Favorites, Blocked), else under its name. Members are full
 * contact objects, as the gateway wants them.
 */
function planMembership(serverGroups, contact, wanted, options) {
    if (!contact || !contact.id) return [];
    const { keys, names } = wanted || {};
    const newId = (options && options.newId) || rules.generateServerId;

    // key -> the name a group of that key is created under
    const want = new Map(list(keys).filter(key => key && !isLocked(key)).map(key => [key, titleForKey(key)]));
    for (const raw of list(names)) {
        const name = rules.capitalizeGroup(raw);
        const key = keyForName(name);
        if (name && !isLocked(key) && !rules.isPurgeGroup(name)) want.set(key, name);
    }

    const writes = [];
    const seen = new Set();
    for (const g of list(serverGroups)) {
        if (!g || rules.isPurgeGroup(g.name)) continue;
        const key = rules.groupKey(g);
        if (isLocked(key)) continue;
        const members = list(g.contacts).filter(m => m && m.id);
        const isMember = members.some(m => m.id === contact.id);
        const wantsIt = want.has(key) && !seen.has(key);   // several server groups, one key: the first gets the contact
        seen.add(key);
        if (wantsIt !== isMember) {
            const contacts = wantsIt ? [...members, contact] : members.filter(m => m.id !== contact.id);
            writes.push({ action: 'update', group: { id: g.id, name: g.name, attributes: { ...g.attributes }, contacts } });
        }
    }

    for (const [key, name] of want) {
        if (seen.has(key)) continue;
        const kind = rules.GROUP_KINDS[key];
        const group = { id: kind ? rules.RESERVED_ID_FOR_KIND[kind] : newId(), name: kind ? titleForKey(key) : name, contacts: [contact] };
        if (kind) group.attributes = { kind };
        writes.push({ action: 'add', group });
    }
    return writes;
}

module.exports = { buildGroups, planMembership, isLocked, keyForName, titleForKey, sanitizeName, ALWAYS_OFFERED };
