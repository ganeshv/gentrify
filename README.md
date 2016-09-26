# gentrify

Tiny, light and fast generator-based async control flow for ES6.

Gentrified code can invoke async functions as if they were synchronous,
completely avoiding a descent into callback hell.

Async functions are written as generators and use the `yield` operator to make
async requests, which include other generators, promises and callback-based
APIs. These requests are resolved by the `gentrify` wrapper and the result
returned by `yield`. Errors in async functions are thrown as exceptions in the
caller.

`gentrify` is only 40 lines, and fits nicely in your brain's L-1 cache. It is
about 10x lower overhead than similar solutions with promises.

It has not been battle-tested and should be considered experimental; caveat
user.

## Example

```js
var run = require('gentrify').run;

function* getQuote(sym) {
    /* invoke a promise-based API */
    const qstr = yield rp(`https://www.google.com/finance/info?q=${sym}`),
        quote = JSON.parse(qstr.slice(qstr.indexOf('[')));
    return +quote[0].l_cur;
}

function* getPortfolio(filename) {
    /* invoke a standard async callback API by wrapping it in a thunk */
    const csv = yield cb => fs.readFile(filename, "utf-8", cb);

    return csv.split('\n')
        .map(line => line.split(','))
        .map(f => ({symbol: f[0], qty: f[1]}))
        .filter(x => !!x.symbol);
}

function* computePortfolio(filename) {
    /* invoke another "async function", i.e. generator */
    const portfolio = yield getPortfolio(filename);

    for (const p of portfolio) {
        /* error handling of async calls with try/catch */
        try {
            p.quote = yield getQuote(p.symbol);
        } catch (e) {
            console.log(`Could not get quote for ${p.symbol}, skipping`);
            continue;
        }
        p.amount = p.quote * p.qty;
    }
    return portfolio.filter(p => 'amount' in p)
        .reduce((acc, p) => acc + p.amount, 0);
}

/* kick everything off. run() returns a promise by default */
run(computePortfolio("foo.csv"))
    .then(x => console.log("Portfolio value", x))
    .catch(x => console.log("Error", x));

/* alternately, supply a callback to run */
run(computePortfolio("foo.csv"), (err, res) => console.log("Portfolio value", res));
```

## Yieldables

The yieldable async operations currently supported are:

  - Generators
  - Promises
  - Thunks (functions which take a single callback)

Arrays and objects are not supported. Use `Promise.all()` for parallel
execution.


## How does `gentrify` compare to X

Some functions are born async. Others achieve asyncness. But most have
asyncness thrust upon them. Some function way down the stack needs to be async
and pretty soon, everybody's sporting `cb` arguments.

[CSP channels](https://github.com/ubolonton/js-csp) are a powerful concept for
processing streams and events. But making every incidentally-async single-value
returning function into a goroutine feels like overkill.

[Co](https://github.com/tj/co) is very small and easy to understand. However,
it deprecates thunks, and wraps everything in promises.

`gentrify`ed code runs leaner because it doesn't wrap the common case
(generators) in promises. Generator-generator calls are "flattened", so
you could have async call stacks millions deep.

Consider the following function which recursively computes the sum of the first
_n_ integers as a representation of the case where most functions are merely
"passthroughs of asycness".

```js
function* sumn(x) {
    return x <= 0 ? 0 : (yield sumn(x - 1));
}
```

`sumn(1000)` takes 13-15ms on `co` and `js-csp`. `gentrify` takes 1-3ms.
A gentrified `sumn` can recurse 1,000,000 times without breaking a
sweat or blowing up the stack - a feat which can't be equalled by either of the
above, which run out of stack around n = 1,000 or indeed, of a plain
synchronous recursive function, which runs out of stack around n = 100,000.

(Tests done on node v6.1.0 on a 2016 Macbook Pro)

## API

### run(fn*).then( val => )

Returns a promise that resolves a generator (not a generator function).

```js
var run = require('gentrify').run;
run(function* (x, y) {
    return x + y;
}("hello ", "world")).then(function (res) {
    console.log(res);
}, function(err) {
    console.err(err.stack);
});
```

### run(fn*, function cb(err, res){})

Runs the generator and invokes the callback `cb` with the error or result.

```js
var run = require('gentrify').run;
run(function* (x, y) {
    return x + y;
}("hello ", "world"), function(err, res) {
    if (err) {
        return console.err(err.stack);
    }
    console.log(res);
});
```

## Platform Compatibility

`gentrify` requires a browser which implements ES6 (as of late 2016, most  
desktop browsers including Chrome and Firefox are supported).

Node v6.1.0 and above work out of the box.

Workarounds for older browsers and node exist, but I haven't tested any of
them.

## License

MIT
