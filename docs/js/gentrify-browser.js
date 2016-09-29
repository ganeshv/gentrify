(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.gentrify = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = {run: run, tc: tc};

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

},{}]},{},[1])(1)
});