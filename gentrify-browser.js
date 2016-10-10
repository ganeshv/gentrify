(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.gentrify = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
 * Drive a generator, which may toss async ops like generators, promises,
 * thunks to us via `yield`, which we get by calling `genObj.next()`.  We
 * resolve the async request and bounce the result back via the next
 * `genObj.next(res)`, which is received by `genObj` as the result of the
 * `yield`.
 */

function run(gen, cb) {
    if (!isGenerator(gen)) throw new TypeError("Not a generator object");
    return (typeof cb === 'function') ? _run(x => cb(null, x), cb) : new Promise(_run);

    function _run(resolve, reject) {
        const genstack = [gen];
        return step();

        function step(res) {
            while (true) {
                const g = genstack[genstack.length - 1];
                try {
                    const {value, done} = res instanceof Error ? g.throw(res) : g.next(res);
                    if (done) {
                        genstack.pop();
                        if (isTailCall(value)) {
                            genstack.push(value._gentrify_tc);
                            res = undefined;
                            continue;
                        }
                        if (genstack.length === 0) return resolve(value);
                        res = value;
                    } else if (isGenerator(value)) {
                        res = undefined;
                        genstack.push(value);
                    } else if (isPromise(value)) {
                        return value.then(x => step(x),
                            x => step(x instanceof Error ? x : new Error(x)));
                    } else if (isCSP(value)) {
                        const cres = handle_csp(value, step);
                        if (cres.type === "block") return;
                        res = cres.value;
                    } else if (typeof value === 'function') { /* thunk */
                        return value((e, r) => step(e ? (e instanceof Error ?
                            e : new Error(e)) : r));
                    } else {
                        throw new TypeError("Unsupported type yielded");
                    }
                } catch (e) {
                    genstack.pop();
                    if (genstack.length === 0) return reject(e);
                    res = e;
                }
            }
        }
    }
}

/*
 * Wrap generator to signal to the trampoline that this is a tail call
 */

function tc(g) {
    if (!isGenerator(g)) throw new Error("Only generators can be returned in tail calls");
    return {_gentrify_tc: g};
}

function isGenerator(g) {
    return g && typeof g.next === 'function' && typeof g.throw === 'function';
}

function isPromise(p) {
    return p && typeof p.then === 'function';
}

function isTailCall(v) {
    return v && isGenerator(v._gentrify_tc);
}

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

module.exports = {
    handle_csp: handle_csp,
    ChanOp: ChanOp,
    CLOSED: CLOSED,
    DEFAULT: DEFAULT,
    NO_VALUE: NO_VALUE,
    chan: chan,
    takeAsync: takeAsync,
    putAsync: putAsync,
    take: take,
    put: put,
    poll: poll,
    offer: offer,
    alts: alts,
    go: go,
    spawn: spawn,
    timeout: timeout,
    run: run,
    tc: tc
};

},{}]},{},[1])(1)
});