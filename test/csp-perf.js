const assert = require('assert');
const co = require('co');
const js_csp = require('js-csp');
const g_csp = require('../gentrify-csp');
let csp;

function* player(name, table, limit) {
    while (true) {
        var ball = yield csp.take(table);
        //console.log("got ball", ball);
        if (ball === csp.CLOSED) {
            console.log(name + ": table's gone");
            return;
        }
        ball.hits += 1;
        if (ball.hits < limit) {
            yield csp.put(table, ball);
        } else {
            table.close();
        }
  }
}

function* runner(limit) {
    var table = csp.chan();

    var ping = csp.go(player, ["ping", table, limit]),
        pong = csp.go(player, ["pong", table, limit]);

  yield csp.put(table, {hits: 0});
  yield ping;
  yield pong;
}


describe('Ping pong - js-csp', function() {
    let n = 10000;
    csp = js_csp;
    this.slow(1);
    this.timeout(100000);
    it(`go(runner(${n}))`, function(done) {
        let ch = csp.go(runner, [n]);
        csp.takeAsync(ch, x => done());
    });
});

describe('Ping pong - gentrify', function() {
    let n = 10000;
    csp = g_csp;
    this.slow(1);
    this.timeout(100000);
    it(`go(runner(${n}))`, function(done) {
        let ch = csp.go(runner, [n]);
        csp.takeAsync(ch, x => done());
    });
});
