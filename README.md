# blink-addressbook

The pure part of the addressbook, shared by the Blink clients: how addresses are matched, what a contact looks
like on the server, who changed what, and how devices of one account tell each other the addressbook changed.

It has no React, no sylkrtc, no storage, no config and no timers of its own. Anything the running app knows (its
domain, its conference bridge, the dial plan, the clock, how to send a message) comes in as an argument. The only
dependency is `crypto-js`, for the fingerprint in the origin stamps.

## Install

    npm install github:<org>/blink-addressbook.js

or, with yarn:

    yarn add github:<org>/blink-addressbook.js

The TypeScript types come with the package: they are found through the `types` field of its `package.json`.

## What it exports

```js
const {
    rules, createRules, ContactIndex, contactPayload, notify, AddressbookNotifier, origin, queueDecision
} = require('blink-addressbook');
```

| Export | What it is |
|---|---|
| `createRules(context)` | The rules bound to one account (see below). |
| `rules` | The helpers that need no account: `isPhoneNumber`, `swapDomain`, `uriUsername`, the group helpers, `generateServerId`, ... |
| `ContactIndex` | A Map-like index of contacts. Keys are canonical (`+31...` for numbers, the SIP bridge domain for conference rooms, lowercase otherwise), and `get`, `has` and `best` accept any spelling of an address. Several owners of one address are kept in a stable order (lowest id first). |
| `contactPayload` | `forServer(contact, existing, rules, options)`: what a contact looks like on the server. Also `cachedRealName`, `adoptsDisplayName`, `nameReplacement`, `echoSpellings`. |
| `notify` | The wire format of the `application/sylk-addressbook-update` tick (`buildTick`, `parseTick`, `isFresh`), the send throttle (`SendThrottle`) and the fetch scheduler (`FetchScheduler`). |
| `AddressbookNotifier` | The timers and rules around the tick. `sendTick(payload)` and `fetch(done)` are injected, so it knows nothing of sylkrtc and runs against a fake clock. |
| `origin` | Origin stamps (`stampPayload`: who changed an entry, when, and why), `contactFingerprint`, `groupFingerprint` and the helpers that compare two documents (`diffDocument`, `formatChanges`). |
| `queueDecision` | `baseFor(current)` and `decide(operation, context)`: may an operation that was queued offline still be sent when it is replayed (`send`, `applied`, `gone`, `overtaken`, `exists`). |

## Example

```js
const { createRules, ContactIndex, contactPayload } = require('blink-addressbook');

// The context is read at call time, so an object with getters over live app state works.
const rules = createRules({
    defaultDomain: 'sylk.link',
    defaultConferenceDomain: 'videoconference.sip2sip.info',
    pstnRules: { replacePlus: '00', replaceLeadingZero: '0031' }
});

const index = new ContactIndex(rules);
index.add('+31646630425', contact);

index.get('0031646630425');   // the same contacts, found by another spelling
index.get('0646630425');      // ... and by the local one, because of replaceLeadingZero
index.best('+31646630425');   // among several owners: the one whose default address it is

// What goes to the server: canonical addresses, one default, a name the server accepts, nothing local.
const payload = contactPayload.forServer(contact, existingServerCopy, rules);
```

### The rules context

| Field | Meaning |
|---|---|
| `defaultDomain` | The account's own domain. |
| `defaultConferenceDomain` | The conference bridge as the app shows it (`videoconference.<domain>`). The server stores rooms under `conference.<domain>`; the rules convert in both directions. |
| `pstnRules` | `{ replacePlus, replaceLeadingZero }`: the dial plan. `replacePlus` is the prefix a `+` is written as (`'00'`), `replaceLeadingZero` the country prefix that stands for a leading `0` (`'0031'`). Leave `replaceLeadingZero` out when it is not set. |
| `onPstnCanon` | Optional `(from, to) => void`, called when a number is canonicalised. |

## Types

`ContactIndex<C>` takes the app's own contact type: `new ContactIndex<Contact>(rules)` types `get`, `best` and
`values`. Without the argument `C` is `any`, so an index whose type is only inferred still fits whatever type the app
gives it. The inputs (`ServerContact`, `UriEntry`, ...) have no index signatures and every field is optional, so an
app contact with extra local fields (`identity`, `key`, ...) is assignable to them.

## Keep these identical to the other clients

Three files are shared with other clients and have to behave the same everywhere, or a name or an address one
client rewrites is one the others disagree about:

- `src/addressbookRules.js` and `src/addressbookNotify.js` are shared with sylk-mobile.
- `src/addressbookOrigin.js`: the fingerprint has to stay byte-identical to Blink's, or the other clients stop
  trusting the stamps. Do not change it.

The behaviour is specified in sylk-mobile: `docs/addressbook/addressbook.md` (addresses, contacts, names, default
address, duplicates) and `docs/messages/sylk-addressbook-update.md` (the tick). When a match goes wrong, the fix is a
rule in `addressbookRules`, not a special case in an app.

## Layout

    index.js                    what is exported (above)
    src/addressbookRules.js     addresses, numbers, rooms, groups; createRules
    src/addressbookNotify.js    tick format, SendThrottle, FetchScheduler
    src/addressbookNotifier.js  AddressbookNotifier
    src/addressbookOrigin.js    stamps and fingerprints
    src/contactIndex.js         ContactIndex
    src/contactPayload.js       forServer and the name rules
    src/queueDecision.js        baseFor, decide
    types/                      TypeScript declarations (index.d.ts, types.d.ts, one per module)

## What it does not do

Talking to the server, storing anything, reading preferences and showing anything is the app's job. A client
connects the pieces: it installs `contactPayload.forServer` and `origin.stampPayload` where its library lets it
rewrite a write, gives the notifier a way to send a message to its own address and to refetch, and builds a
`ContactIndex` from the addressbook it fetched.

## License

Blink-addressbook is licensed under the GNU General Public License version 3. See `LICENSE`.
