'use strict';

/*
 * Which addressbook contacts own an address. A Map-like index whose keys are
 * canonical (rules.normServerUri: +E.164 for phone numbers, videoconference.X
 * for conference rooms, lowercase otherwise) and whose get/has accept ANY
 * spelling of an address.
 *
 * Pure: the rules come in through the constructor, nothing is imported from
 * the app, so this folder can be lifted out as a package later.
 */

class ContactIndex {
    constructor(rules) {
        this._rules = rules;
        this._map = new Map();
    }

    // Canonical key for any spelling of an address; '' when there is none.
    key(uri) {
        if (typeof uri !== 'string' || !uri.trim()) return '';
        return this._rules.normServerUri(uri) || '';
    }

    // A contact owning two spellings of one address is listed once under it.
    add(uri, contact) {
        const k = this.key(uri);
        if (!k || !contact) return;
        const list = this._map.get(k);
        if (!list) {
            this._map.set(k, [contact]);
        } else if (!list.includes(contact)) {
            list.push(contact);
            // Survivor rule every client applies to duplicates (addressbook
            // spec 16.1): lowest id first by String(a.id).localeCompare(String(b.id)).
            list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        }
    }

    // Among several owners: the one whose default address it is, else the first.
    best(uri) {
        const list = this.get(uri);
        if (!list || list.length === 0) return null;
        const k = this.key(uri);
        return list.find(c => c && c.defaultUri && this.key(c.defaultUri.uri) === k) || list[0];
    }

    get(uri) { return this._map.get(this.key(uri)); }
    has(uri) { return this._map.has(this.key(uri)); }
    get size() { return this._map.size; }
    keys() { return this._map.keys(); }
    values() { return this._map.values(); }
    entries() { return this._map.entries(); }
    forEach(callback, thisArg) {
        this._map.forEach((value, key) => callback.call(thisArg, value, key, this));
    }
    [Symbol.iterator]() { return this._map[Symbol.iterator](); }
}

module.exports = ContactIndex;
