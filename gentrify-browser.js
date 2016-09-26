(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.gentrify = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = {run: run};

/*
 * Run a generator
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
                        if (genstack.length === 0) return resolve(value);
                        res = value;
                    } else if (isGenerator(value)) {
                        res = undefined;
                        genstack.push(value);
                    } else if (isPromise(value)) {
                        return value.then(x => step(x),
                            x => step(x instanceof Error ? x : new Error(x)));
                    } else if (typeof value === 'function') {
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

function isGenerator(g) {
    return g && typeof g.next === 'function' && typeof g.throw === 'function';
}

function isPromise(p) {
    return p && typeof p.then === 'function';
}

},{}]},{},[1])(1)
});