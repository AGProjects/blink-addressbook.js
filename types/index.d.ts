import * as rulesModule from './addressbookRules';
import * as contactPayloadModule from './contactPayload';
import * as notifyModule from './addressbookNotify';
import * as originModule from './addressbookOrigin';
import * as queueDecisionModule from './queueDecision';

export * from './types';

export { rulesModule as rules };                       // the helpers that need no account
export const createRules: typeof rulesModule.create;   // createRules(context) -> the rules bound to one account
export { contactPayloadModule as contactPayload };     // forServer(contact, existing, rules, options)
export { notifyModule as notify };                     // tick wire format, send throttle, fetch scheduler
export { originModule as origin };                     // origin stamps and contactFingerprint
export { queueDecisionModule as queueDecision };       // baseFor(current), decide(operation, context)
