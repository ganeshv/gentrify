const assert = require('assert');
const run = require('../lib/gentrify').run;
const tc = require('../lib/gentrify').tc;
const co = require('co');
const csp = require('js-csp');


function* sumn(x) {
    return x <= 0 ? 0 : x + (yield sumn(x - 1));
}

function* go_sumn(x) {
    return x <= 0 ? 0 : x + (yield csp.go(go_sumn, [x - 1]));
}

function check(x, n) {
    return x === n * (n + 1) / 2;
}

/* Tail-recursive form of sumn */
function* tsumn(x, acc=0) {
    return x <= 0 ? acc : tc(tsumn(x - 1, x + acc));
}

describe("Performance - co", function() {
    let n = 1000;
    this.slow(1);
    it(`co(sumn(${n}))`, function() {
        return co(sumn(n)).then(function(x) {
            assert(check(x, n));
        });
    });
});
describe("Performance - go", function() {
    let n = 1000;
    this.slow(1);
    it(`go(go_sumn(${n}))`, function(done) {
        let ch = csp.go(go_sumn, [n]);
        csp.takeAsync(ch, function(x) {
            return check(x, n) ? done() : done(new Error("foo"));
        });
    });
});
describe("Performance - gentrify", function() {
    let n = 1000;
    this.slow(1);
    it(`run(sumn(${n}))`, function() {
        return run(sumn(n)).then(function(x) {
            assert(check(x, n));
        });
    });
});

describe('"Stack" depth - gentrify', function() {
    let n = 1000000;
    this.slow(1);
    it(`run(sumn(${n}))`, function() {
        return run(sumn(n)).then(function(x) {
            assert(check(x, n));
        });
    });
});

describe('Tail call - gentrify', function() {
    let n = 1000000;
    this.slow(1);
    this.timeout(100000);
    it(`run(tsumn(${n}))`, function() {
        return run(tsumn(n)).then(function(x) {
            assert(check(x, n));
        });
    });
});
