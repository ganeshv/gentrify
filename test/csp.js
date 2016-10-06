const assert = require('assert');
const csp = require('../gentrify-csp'),
    chan = csp.chan,
    go = csp.go,
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
    DEFAULT_VALUE = csp.DEFAULT_VALUE,
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
            console.log(res);
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
    });
});
