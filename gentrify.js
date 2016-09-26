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
