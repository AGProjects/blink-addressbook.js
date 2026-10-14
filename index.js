'use strict';

/*
 * blink-addressbook-core: the pure part of the addressbook, shared by every client.
 *
 * No React, no sylkrtc, no storage, no config, no timers of its own. Anything
 * the running app knows comes in as an argument. The one outside dependency is
 * crypto-js/sha1, used by addressbookOrigin.js for the stamp fingerprint. Today this is a folder in the
 * desktop app (require('./addressbook')); when a second client takes it over it
 * becomes a package and only the require string changes.
 */

const rules = require('./src/addressbookRules');
const ContactIndex = require('./src/contactIndex');
const contactPayload = require('./src/contactPayload');
const contactGroups = require('./src/contactGroups');
const notify = require('./src/addressbookNotify');
const AddressbookNotifier = require('./src/addressbookNotifier');
const origin = require('./src/addressbookOrigin');
const queueDecision = require('./src/queueDecision');

module.exports = {
    rules,                      // the helpers that need no account (isPhoneNumber, swapDomain, ...)
    createRules: rules.create,  // createRules(context) -> the rules bound to one account
    ContactIndex,               // new ContactIndex(boundRules)
    contactPayload,             // forServer(contact, existing, rules, options): what a contact looks like on the server
    contactGroups,              // buildGroups(serverGroups, knownIds), planMembership(serverGroups, contact, wanted): groups as a list shows them, and the writes that change a contact's groups
    notify,                     // tick wire format, send throttle, fetch scheduler
    AddressbookNotifier,        // timers and rules around them; sendTick/fetch are injected
    origin,                     // origin stamps: stampPayload(kind, payload, previous, { deviceId, agent, reason })
    queueDecision               // baseFor(currentContact), decide(op, { current, contacts, rules }): may a queued write still be sent
};
