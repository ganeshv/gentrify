const assert = require('assert');
const csp = require('../gentrify-csp'),
    chan = csp.chan,
    go = csp.go,
    spawn = csp.spawn,
    put = csp.put,
    take = csp.take,
    poll = csp.poll,
    offer = csp.offer,
    alts = csp.alts,
    takeAsync = csp.takeAsync,
    putAsync = csp.putAsync,
    timeout = csp.timeout,
    CLOSED = csp.CLOSED,
    NO_VALUE = csp.NO_VALUE,
    DEFAULT = csp.DEFAULT,
    run = csp.run;

describe("put", function() {
    it("should block if there are no takers", function(done) {
        var ch = chan();
        setTimeout(() => done(), 500);
        run(function* () {
            var x = yield put(ch, 42);
            done("oops");
        }());
    });
    it("should not block if there are takers", function() {
        var ch = chan();
        takeAsync(ch, x => x);
        return run(function* () {
            var x = yield put(ch, 42);
            assert(x === true);
        }());
    });
    it("should return false for a closed channel", function() {
        var ch = chan();
        ch.close();
        return run(function* () {
            var x = yield put(ch, 42);
            assert(x === false);
        }());
    });
    it("should reject attempts to send CLOSED", function() {
        var ch = chan();
        return run(function* () {
            try {
                var x = yield put(ch, CLOSED);
            } catch (e) {
                assert(~e.message.indexOf("Cannot put CLOSED"));
            }
        }());
    });
});

describe("take", function() {
    it("should block if there are no putters", function(done) {
        var ch = chan();
        run(function* () {
            var x = yield take(ch);
            return x;
        }()).then(x => done("oops"), x => done("oops"));
        setTimeout(() => done(), 500);
    });
    it("should not block if there are putters", function() {
        var ch = chan();
        putAsync(ch, 42, x => x);
        return run(function* () {
            var x = yield take(ch);
            assert(x === 42);
        }());
    });
    it("should return CLOSED for closed channels", function() {
        var ch = chan();
        ch.close();
        return run(function* () {
            var x = yield take(ch);
            assert(x === CLOSED);
        }());
    });
    it("is implicit if a channel is yielded", function() {
        var ch = chan();
        putAsync(ch, 42, x => x);
        return run(function* () {
            var x = yield ch;
            assert(x === 42);
        }());
    });
});

describe("putAsync", function() {
    it("should block if there are no takers", function(done) {
        var ch = chan();
        setTimeout(() => done(), 500);
        putAsync(ch, 42, () => done(new Error("oops")));
    });
    it("should not block if there are takers", function(done) {
        var ch = chan();
        takeAsync(ch, x => x);
        putAsync(ch, 42, x => done());
    });
    it("should return false for a closed channel", function(done) {
        var ch = chan();
        takeAsync(ch, x => x);
        ch.close();
        putAsync(ch, 42, x => done(x === false ? undefined : new Error("foo")));
    });
    it("should reject attempts to send CLOSED", function() {
        var ch = chan();
        try {
            var x = putAsync(ch, CLOSED, x => x);
        } catch (e) {
            assert(~e.message.indexOf("Cannot put CLOSED"));
        }
    });
    it("should work without callback", function(done) {
        var ch = chan();
        putAsync(ch, 42);
        takeAsync(ch, x => done(x === 42 ? undefined : new Error("foo")));
    });
});

describe("takeAsync", function() {
    it("should block if there are no putters", function(done) {
        var ch = chan();
        setTimeout(() => done(), 500);
        takeAsync(ch, () => done(new Error("oops")));
    });
    it("should not block if there are putters", function(done) {
        var ch = chan();
        putAsync(ch, 42);
        takeAsync(ch, x => done(x === 42 ? undefined : new Error("foo")));
    });
    it("should return CLOSED for a closed channel", function(done) {
        var ch = chan();
        ch.close();
        takeAsync(ch, x => done(x === CLOSED ? undefined : new Error("foo")));
    });
});

describe("offer", function() {
    it("should return false if the channel is closed", function() {
        var ch = chan();
        ch.close();
        assert(offer(ch, 42) === false);
    });
    it("should return true if there are takers", function(done) {
        var ch = chan();
        takeAsync(ch, x => done(x === 42 ? undefined : new Error("foo")));
        assert(offer(ch, 42) === true);
    });
    it("should return false if there are no takers", function() {
        var ch = chan();
        assert(offer(ch, 42) === false);
    });
    it("should reject attempts to send CLOSED", function() {
        var ch = chan();
        takeAsync(ch, x => x);
        try {
            var x = offer(ch, CLOSED, x => x);
        } catch (e) {
            assert(~e.message.indexOf("Cannot put CLOSED"));
        }
    });
});

describe("poll", function() {
    it("should return NO_VALUE if the channel is closed", function() {
        var ch = chan();
        ch.close();
        assert(poll(ch) === NO_VALUE);
    });
    it("should return value if there are putters", function() {
        var ch = chan();
        putAsync(ch, 42);
        assert(poll(ch) === 42);
    });
    it("should return NO_VALUE if there are no putters", function() {
        var ch = chan();
        assert(poll(ch) === NO_VALUE);
    });
});

describe("close", function() {
    it("should return false to pending puts", function() {
        function* putter(ch, n) {
            assert((yield put(ch, 42)) === false);
            return n;
        }
        let ch = chan(),
            data = ["a", "b", "c"],
            putters = data.map(x => run(putter(ch, x)));
        ch.close();
        return Promise.all(putters).then(xs => assert.deepEqual(xs, data));
    });
    it("should return CLOSED to pending takes", function() {
        function* taker(ch, n) {
            assert((yield ch) === CLOSED);
            return n;
        }
        let ch = chan(),
            data = ["a", "b", "c"],
            takers = data.map(x => run(taker(ch, x)));
        ch.close();
        return Promise.all(takers).then(xs => assert.deepEqual(xs, data));
    });
});

describe("alts", function() {
    it("should work with one channel (take)", function() {
        function* alter(ch) {
            let res = yield alts([ch]);
            assert(res.channel === ch);
            assert(res.value === 42);
        }
        let ch = chan();
        putAsync(ch, 42);
        return run(alter(ch));
    });
    it("should work with one channel (put)", function() {
        function* alter(ch) {
            let res = yield alts([[ch, 42]]);
            assert(res.channel === ch);
            assert(res.value === true);
        }
        function* taker(ch) {
            return yield ch;
        }
        let ch = chan();
        take(ch, 42);
        return Promise.all([run(alter(ch)), run(taker(ch))]);
    });
    it("should reject an empty list", function() {
        return run(function* () {
            yield alts([]);
        }()).catch(x => assert(~x.message.indexOf("Empty alts list")));
    });
    it("should work in non-blocking mode", function() {
        let chs = [chan(), chan(), chan()];
        return run(function* () {
            let res = yield alts(chs, {default: "foo"});
            assert(res.channel === DEFAULT);
            assert(res.value === "foo");
        }());
    });
    it("should return default in non-blocking mode if no channel ready", function() {
        let chs = [chan(), chan(), chan()];
        return run(function* () {
            let res = yield alts(chs, {default: "foo"});
            assert(res.channel === DEFAULT);
            assert(res.value === "foo");
        }());
    });
    it("should return non-default in non-blocking mode if channel ready", function() {
        let chs = [chan(), chan(), chan()],
            achs = [chs[0], chs[1], [chs[2], 43]];
        putAsync(chs[1], 42);
        return run(function* () {
            let res = yield alts(achs, {default: "foo"});
            assert(res.channel === chs[1]);
            assert(res.value === 42);
        }());
    });
    it("should return available value (take)", function() {
        let chs = [chan(), chan(), chan()],
            achs = [chs[0], chs[1], [chs[2], 43]];
        putAsync(chs[1], 42);
        return run(function* () {
            let res = yield alts(achs);
            assert(res.channel === chs[1]);
            assert(res.value === 42);
        }());
    });
    it("should return available value (put)", function() {
        let chs = [chan(), chan(), chan()],
            achs = [chs[0], chs[1], [chs[2], 43]];
        return Promise.all([
            run(function* () {
                let res = yield alts(achs);
                assert(res.channel === chs[2]);
                assert(res.value === true);
            }()),
            run(function* () {
                assert((yield take(chs[2])) === 43);
            }())
        ]);
    });
    it("should pick random available channel", function() {
        let range = [...Array(1000).keys()],
            chs = range.map(x => chan());

        /* fill all channels with data */
        for (const ch of chs) {
            putAsync(ch, 42);
        }
        return run(function* () {
            let res = yield alts(chs);
            assert(res.channel !== chs[0]);
            assert(res.value === 42);
        }());
    });
    it("should pick available channel according to priority", function() {
        let range = [...Array(1000).keys()],
            chs = range.map(x => chan());

        /* fill channel 3 onwards with data */
        for (const ch of chs.slice(3)) {
            putAsync(ch, 42);
        }
        return run(function* () {
            let res = yield alts(chs, {priority: true});
            assert(res.channel === chs[3]);
            assert(res.value === 42);
        }());
    });
});

describe("timeout", function() {
    it("should close channel after timeout", function() {
        return run(function* () {
            const ms = 200,
                start = new Date().getTime();
            yield timeout(ms);
            const now = new Date().getTime();
            assert(now - start > ms * 0.95);
        }());
    });
});

describe("go", function() {
    it("should put return value on channel and close", function() {
        return run(function* () {
            let ch = go(function* (val) {
                    return val;
                }, [42]);
            assert((yield ch) === 42);
            assert((yield ch) === CLOSED);
        }());
    });
    it("should work without arguments", function() {
        return run(function* () {
            let ch = go(function* (val) {
                    return 42;
                });
            assert((yield ch) === 42);
            assert((yield ch) === CLOSED);
        }());
    });
});

describe("spawn", function() {
    it("should put return value on channel and close", function() {
        return run(function* () {
            let ch = spawn(function* (val) {
                    return val;
                }(42));
            assert((yield ch) === 42);
            assert((yield ch) === CLOSED);
        }());
    });
});

