const fs = require("fs"),
    csp = require("./gentrify-csp");
    //csp = require("js-csp");


function* player(name, table) {
  while (true) {
    var ball = yield csp.take(table);
    console.log("got ball", ball);
    if (ball === csp.CLOSED) {
      console.log(name + ": table's gone");
      return;
    }
    ball.hits += 1;
    console.log(name + " " + ball.hits);
    yield csp.timeout(1000);
    yield csp.put(table, ball);
  }
}

csp.go(function* () {
  var table = csp.chan();

  csp.go(player, ["ping", table]);
  csp.go(player, ["pong", table]);

  yield csp.put(table, {hits: 0});
  yield csp.timeout(10000);
  table.close();
});
