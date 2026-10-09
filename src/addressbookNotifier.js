'use strict';

/*
 * application/sylk-addressbook-update for this client: tell the account's
 * other devices after we changed the server addressbook, and refetch when one
 * of them tells us.
 *
 * The wire format and the two state machines (one tick per burst, a floor and
 * a fuse on sending; jitter, coalescing and backoff on fetching) are
 * addressbookNotify.js, shared verbatim with sylk-mobile. This is the glue the
 * mobile keeps in app.js: timers, what counts as "our writes have settled",
 * sending, and the refetch. Spec: sylk-mobile
 * docs/messages/sylk-addressbook-update.md.
 *
 * Knows nothing about sylkrtc: the two things it needs from the outside come in
 * as functions, sendTick(payload) and fetch(done), so any client can use it and
 * it runs in a test with a fake clock.
 *
 * Sender rules kept here:
 *   - a write counts only once the server has confirmed it (writeFinished with
 *     ok), and a tick goes out only when no write of ours is still in flight;
 *   - contacts and groups only -- policies never reach this;
 *   - how a tick is sent (cleartext, not journalled, no acknowledgement, not
 *     kept as a message) is the caller's sendTick.
 * Receiver rules kept here:
 *   - only from our own account (the caller checks the sender) and never our
 *     own echo (origin === this device);
 *   - freshness judged on arrival;
 *   - never fetch while our own writes are in flight;
 *   - the ids are logged, never used to decide whether to fetch.
 */

const abNotify = require('./addressbookNotify');

const WRITE_TIMEOUT_MS = 60000;     // a write whose callback never comes stops blocking after this
const FETCH_TIMEOUT_MS = 30000;     // so does a fetch whose callback never comes

class AddressbookNotifier {
    constructor(options = {}) {
        this._deviceId = options.deviceId || (() => '');
        this._log = options.log || (() => {});
        this._setTimeout = options.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        this._clearTimeout = options.clearTimeout || ((t) => clearTimeout(t));
        const clock = options.now ? { now: options.now } : {};
        this._throttle = new abNotify.SendThrottle(clock);
        this._scheduler = new abNotify.FetchScheduler(Object.assign({}, clock, options.rand ? { rand: options.rand } : {}));
        this._sendTick = options.sendTick || (() => {});         // (payload) => void, to our OWN address
        this._fetch = options.fetch || ((done) => done());        // (done) => void, refetch the addressbook
        this._inFlight = 0;
        this._notifyTimer = null;
        this._fetchTimer = null;
        this._wanted = { contacts: new Set(), groups: new Set(), truncated: false };
    }

    settled() {
        return this._inFlight === 0;
    }

    // Writes confirmed while suppressed are not announced: a repair is derived
    // state every device reaches from the same document on its own
    // (sylk-addressbook-update.md section 5). Hold it across the whole of the
    // work, including the answers to its writes.
    suppress() {
        this._throttle.suppress();
    }

    resume() {
        this._throttle.resume();
    }

    // ---- send side -------------------------------------------------------

    // A write left for the server. Returns the callback to call when it is
    // answered; safe to call more than once.
    writeStarted(kind, id) {
        this._inFlight += 1;
        let finished = false;
        const timer = this._setTimeout(() => finish(new Error('no answer')), WRITE_TIMEOUT_MS);
        const finish = (error) => {
            if (finished) return;
            finished = true;
            this._clearTimeout(timer);
            this._inFlight = Math.max(0, this._inFlight - 1);
            if (!error) {
                // Only a write the server took is worth announcing.
                this._throttle.note(kind === 'group' ? 'group' : 'contact', id);
            }
            this._arm();
        };
        return finish;
    }

    _arm() {
        if (this._notifyTimer) {
            this._clearTimeout(this._notifyTimer);
            this._notifyTimer = null;
        }
        const delay = this._throttle.delay();
        if (delay === null) return;
        this._notifyTimer = this._setTimeout(() => this._flush(), delay);
    }

    _flush() {
        this._notifyTimer = null;
        const tick = this._throttle.take(this.settled());
        if (!tick) {
            // Not due, not settled, or the fuse is blown: the ids are held,
            // nothing is lost, only late.
            const d = this._throttle.delay();
            if (d !== null) {
                this._notifyTimer = this._setTimeout(() => this._flush(),
                    Math.max(d, this._throttle.fuseBlown ? 30000 : 1000));
            }
            return;
        }
        this._send(tick);
        this._arm();
    }

    _send(tick) {
        const payload = abNotify.buildTick({
            origin: this._deviceId(),
            contactIds: tick.contactIds,
            groupIds: tick.groupIds,
            truncated: tick.truncated
        });
        this._log('[ab] [notify] addressbook changed -> own devices: contacts=' + tick.contactIds.length
            + ' groups=' + tick.groupIds.length + (tick.truncated ? ' (truncated)' : ''));
        try {
            this._sendTick(payload);
        } catch (e) {
            this._log('[ab] [notify] send failed: ' + (e && e.message ? e.message : e));
        }
    }

    // ---- receive side ----------------------------------------------------

    // A tick from one of our own devices. The caller has checked that it came
    // from our own account.
    receive(message) {
        const tick = abNotify.parseTick((message && message.content) || '');
        if (!tick) return false;
        if (tick.origin && tick.origin === this._deviceId()) return false;     // our own echo
        if (!abNotify.isFresh(tick.timestamp)) {
            this._log('[ab] [notify] ignoring stale addressbook tick');
            return false;
        }
        if (tick.truncated || tick.contactIds === null) this._wanted.truncated = true;
        (tick.contactIds || []).forEach((id) => this._wanted.contacts.add(id));
        (tick.groupIds || []).forEach((id) => this._wanted.groups.add(id));

        const delay = this._scheduler.schedule();
        if (delay === null) {
            this._log('[ab] [notify] tick merged into the fetch already coming');
            return true;
        }
        this._log('[ab] [notify] addressbook changed elsewhere, fetching in ' + Math.round(delay / 1000) + 's');
        this._armFetch(delay);
        return true;
    }

    _armFetch(delay) {
        if (this._fetchTimer) this._clearTimeout(this._fetchTimer);
        this._fetchTimer = this._setTimeout(() => this._fire(), delay);
    }

    _fire() {
        this._fetchTimer = null;
        const decision = this._scheduler.fire(this.settled());
        if (!decision.fetch) {
            if (decision.backedOff) this._log('[ab] [notify] too many fetches, backing off');
            if (decision.retryIn != null) this._armFetch(decision.retryIn);
            return;
        }
        const wanted = this._wanted;
        this._wanted = { contacts: new Set(), groups: new Set(), truncated: false };
        this._log('[ab] [notify] fetching addressbook' + (wanted.truncated
            ? ' (full, the sender could not name what changed)'
            : ' (contacts=' + wanted.contacts.size + ' groups=' + wanted.groups.size + ')'));
        // A fetch whose answer never comes must not leave the scheduler "in flight" for good: every later
        // tick would be merged into a fetch that never happens.
        let answered = false;
        let timer = null;
        const done = () => {
            if (answered) return;
            answered = true;
            this._clearTimeout(timer);
            const next = this._scheduler.done();
            if (next != null) this._armFetch(next);
        };
        timer = this._setTimeout(() => {
            this._log('[ab] [notify] the fetch was never answered, carrying on');
            done();
        }, FETCH_TIMEOUT_MS);
        try {
            this._fetch(done);
        } catch (e) {
            this._log('[ab] [notify] fetch failed: ' + (e && e.message ? e.message : e));
            done();
        }
    }

    dispose() {
        if (this._notifyTimer) this._clearTimeout(this._notifyTimer);
        if (this._fetchTimer) this._clearTimeout(this._fetchTimer);
        this._notifyTimer = null;
        this._fetchTimer = null;
    }
}

module.exports = AddressbookNotifier;
