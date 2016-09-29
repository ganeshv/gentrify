# gentrify

Small, light, fast generator-based async control flow for ES6. `gentrified`
code can invoke async functions as if they were synchronous. No more callback
hell.

`gentrify` is only 40 lines, and fits nicely in your brain's L-1 cache. It is
about 10x lower overhead than similar solutions with promises. Async call stack
depth can exceed a million without hitting stack overflow. Explicit tail calls
are optimized.

Async functions are written as generators and use the `yield` operator to toss
async requests at the `gentrify` trampoline. Request types include other
generators, promises and callback-based APIs, which are resolved and bounced
back via the return value of `yield`. Errors in async functions are thrown as
exceptions in the caller.

_This project is an experiment; caveat user._

## Example

```js
var run = require('gentrify').run,
    topics = ["generator", "es6"];

function* githubSearch(topics) {
    for (var t of topics) {
        // invoke a promise-based API
        var data = yield $.getJSON(`https://api.github.com/search/repositories?q=${t}&sort=stars`);
        console.log(data.items.slice(0, 5).map(x => `${x.full_name},${x.stargazers_count}`).join('\n'));
        console.log("sleeping 3 seconds...");
        // invoke another async function
        yield sleep(3000);
    }
    return "done!";
}

function* sleep(ms) {
    // invoke a callback-based API
    return yield cb => setTimeout(cb, ms);
}

gentrify.run(githubSearch(topics))
    .then(x => console.log(x))
    .catch(x => console.log("Error", x));
```

## How does `gentrify` compare to X

Some functions are born async, some achieve asyncness, but most have asyncness
thrust upon them. A function way down the stack needs to be async and pretty
soon, every intermediate function sports a callback monkey on its back.

The `gentrify` trampoline adds very little overhead for the common case of
intermediate functions. Generator-generator calls are accumulated in an array.
Since it is on the heap, you can have async call depths in the millions without
overflowing the stack. Moreover, the generator can return an explicitly flagged
tail call, which the trampoline can optimize to minimal stack and heap
overhead.

[CSP channels](https://github.com/ubolonton/js-csp) are a powerful concept for
processing streams and events. But making every intermediate single-output
function into a goroutine feels like overkill.

[Co](https://github.com/tj/co) is very small and easy to understand. It
deprecates thunks, and wraps everything in promises, which limit stack depth
to about 1,000 - which should be good enough in most cases. `Co` is the most
popular and battle-tested of the lot, and should be preferred for serious
usage.

Consider the following function which recursively computes the sum of the first
_n_ integers. The idea is to measure the "sync convenience tax" we pay for
using these libraries.

```js
function* sumn(x) {
    return x <= 0 ? 0 : (yield sumn(x - 1));
}
```

See a [browser demo](https://ganeshv.github.io/gentrify/) or run `npm test`.

`sumn(1000)` takes 13-15ms on `co` and `js-csp`. `gentrify` takes 1-3ms.

A gentrified `sumn` can recurse _millions_ of times without breaking a sweat or
blowing up the stack - a feat which can't be equalled by either of the above,
which run out of stack around n = 1,000. Even a plain synchronous recursive
function runs out of stack around n = 100,000.

(Tests done on node v6.1.0 on a 2016 Macbook Pro)

## API

### function* asyncfunc(...args)

A `gentrifiable` async function is specified as follows:

  - It must be a generator function.
  - It can `yield` the following async operations:
    - Generator object. This in turn must have been created from a
      gentrifiable generator function.
    - Promise or `then`able.
    - Thunk. This is a function taking a single callback argument. Used to
      invoke NodeJS-style callback APIs. e.g.
      `function(cb) { return fs.readFile("name", "utf-8", cb); }`
  - It uses `return` to pass its result to its caller.
  - It can signal a tail call by `return`ing a generator object wrapped by
    `gentrify.tc()`. e.g. `gentrify.tc(genfunc(...args))`
  - Errors from yieldables are thrown and can be caught by the caller.
  - It signals errors to its caller by throwing an exception or returning
    an `Error` instance. In both cases, the caller receives an exception.

Arrays and objects are not supported as yieldables. Use `Promise.all()` for
parallel operations.

### gentrify.run(genObj).then( val => )

Returns a promise that resolves a generator (not a generator function).

```js
var run = require('gentrify').run;
function* githubSearch(list) {...}

run(githubSearch(["ajax", "cors"]))
    .then(res => console.log(res), err => console.log("error", err.message));
```

### gentrify.run(genObj, function cb(err, res){})

Runs the generator and invokes the callback `cb` with the error or result.

```js
var run = require('gentrify').run;
function* githubSearch(list) {...}

run(githubSearch(["ajax", "cors"], (err, res) => {
    if (err) {
        return console.log("error", err.message);
    }
    console.log(res);
}));
```

### gentrify.tc(genObj)

Wraps the generator object in a structure recognized as a tail call by the
`gentrify.run()` trampoline. The wrapped object can be supplied as the argument
to the `return` statement of a generator function to trigger tail call
optimization.

```js
var run = require('gentrify').run,
    tc = require('gentrify').tc;

function* sumn(n, acc=0) {
    return n <= 0 ? acc : tc(sumn(n - 1, n + acc));
}

run(sumn(10000000))
    .then(res => console.log(res), err => console.log("error", err.message));
`
```
## Platform Compatibility

`gentrify` requires a browser which implements ES6 (as of late 2016, most  
desktop browsers including Chrome 53.0+, Firefox 48.0+ and Safari 10.0+ are
supported).

Node v6.1.0 and above work out of the box.

Workarounds for older browsers and node exist, but I haven't tested any of
them.

## License

MIT
