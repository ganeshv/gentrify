import {run} from './gentrify';

function isCSP(v) {
    return v instanceof ChanOp || v instanceof Channel;
}

function handle_csp(op, step) {
    try {
        if (op instanceof Channel) op = take(op);
        switch (op.type) {
            case "take":
                return op.chan.take(new Handler({active: true}, step));
            case "put":
                return op.chan.put(op.value, new Handler({active: true}, step));
            case "alts":
                return do_alts(op.ops, op.opts, step);
            default:
                throw new Error("Unknown CSP instruction ${op.type}");
        }
    } catch (e) {
        return {type: "value", value: e};
    }
}

function do_alts(oplist, opts, step) {
    if (oplist.length === 0) throw new Error("Empty alts list");

    let res = {},
        indexes = range(oplist.length),
        priority = opts && opts.priority,
        flag = {active: true};

    if (!priority) indexes = shuffle(indexes);

    for (let i = 0; i < oplist.length; i++) {
        const op = priority ? oplist[i] : oplist[indexes[i]],
            ch = op instanceof Channel ? op : op[0],
            handler = new Handler(flag, x => step({channel: ch, value: x}));

        res = op instanceof Channel ? ch.take(handler) : ch.put(op[1], handler);
        if (res.type !== "block") {
            return {type: "value", value: {channel: ch, value: res.value}};
        }
    }

    /* nothing was ready */
    if (opts && opts.default) {
        flag.active = false; /* torpedo all handlers queued above */
        return {type: "value", value: {channel: DEFAULT, value: opts.default}};
    }
    return res;
}

const CLOSED = null;
const DEFAULT = "xxx_def";
const NO_VALUE = "xxx_novalue";

class ChanOp {
    constructor(opts) {
        Object.assign(this, opts);
    }
}

class Handler {
    constructor(flag, cb) {
        this.flag = flag;
        this.cb = cb;
    }
    active() {
        return this.flag.active;
    }
    deactivate() {
        this.flag.active = false;
    }
}

class Channel {
    constructor() {
        this.takes = [];
        this.puts = [];
        this.closed = false;
    }

    put(value, handler) {
        if (value === CLOSED) {
            throw new Error("Cannot put CLOSED");
        }
        if (this.closed) {
            return {type: "value", value: false};
        }
        while (this.takes.length) {
            const taker = this.takes.shift();
            if (!taker.active()) continue;
            if (handler) handler.deactivate();
            taker.deactivate();
            schedule(taker.cb, value);
            return {type: "value", value: true};
        }
        if (handler) {
            this.puts.push({handler: handler, value: value});
            return {type: "block"};
        }
        return {type: "value", value: false};
    }

    take(handler) {
        while (this.puts.length) {
            const {handler: putter, value} = this.puts.shift();
            if (!putter.active()) continue;
            putter.deactivate();
            schedule(putter.cb, true);
            if (handler) handler.deactivate();
            return {type: "value", value: value};
        }

        if (this.closed) {
            if (handler) {
                handler.deactivate();
                return {type: "value", value: CLOSED};
            }
            return {type: "value", value: NO_VALUE};
        }
        if (handler) {
            this.takes.push(handler);
            return {type: "block"};
        }
        return {type: "value", value: NO_VALUE};
    }

    close() {
        if (this.closed) return;
        this.closed = true;

        while (this.takes.length) {
            const taker = this.takes.shift();
            if (!taker.active()) continue;
            taker.deactivate();
            schedule(taker.cb, CLOSED);
        }
            
        while (this.puts.length) {
            const {handler: putter, value} = this.puts.shift();
            if (!putter.active()) continue;
            putter.deactivate();
            schedule(putter.cb, false);
        }
    }
}

function chan() {
    return new Channel();
}

function takeAsync(ch, cb) {
    const ret = ch.take(new Handler({active: true}, cb));
    if (ret.type === "value") {
        cb(ret.value);
    }
}

function putAsync(ch, val, cb) {
    cb = cb || (x => {});
    const ret = ch.put(val, new Handler({active: true}, cb));
    if (ret.type === "value") {
        cb(ret.value);
    }
}

function put(ch, val) {
    return new ChanOp({type: "put", chan: ch, value: val});
}

function take(ch) {
    return new ChanOp({type: "take", chan: ch});
}

function offer(ch, value) {
    const ret = ch.put(value);
    return ret.value;
}

function poll(ch) {
    const ret = ch.take();
    return ret.value;
}

function alts(ops, opts) {
    return new ChanOp({type: "alts", ops: ops, opts: opts});
}

function spawn(gen) {
    const ch = chan();

    run(gen, (err, res) => putAsync(ch, err || res, () => ch.close()));
    return ch;
}

function go(gf, args=[]) {
    return spawn(gf(...args));
}

function schedule(f, ...args) {
    setTimeout(() => f(...args), 0);
}

function timeout(ms) {
    const ch = chan();
    setTimeout(() => ch.close(), ms);
    return ch;
}

/* Utility functions */

function range(n) {
    return [...Array(n).keys()];
}

/* shuffle array in-place */
function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

export {isCSP, handle_csp};

export const csp = {handle_csp, ChanOp, DEFAULT, NO_VALUE, CLOSED, chan,
    takeAsync, putAsync, take, put, poll, offer, alts, go, spawn, timeout};
