const fs = require("fs"),
    rp = require("request-promise"),
    run = require("../gentrify").run;

function* computePortfolio(filename) {
    /* call another "async function", i.e. generator object */
    const portfolio = yield getPortfolio(filename);

    console.log(`Symbol\t\tQty\t\tQuote\t\tAmount`);
    for (const p of portfolio) {
        /* error handling of async calls with try/catch */
        try {
            p.quote = yield getQuote(p.symbol);
        } catch (e) {
            console.log(`(could not get quote for ${p.symbol}, skipping)`);
            continue;
        }
        p.amount = p.quote * p.qty;
        console.log(`${p.symbol}\t\t${p.qty}\t\t${p.quote}\t\t${p.amount}`);
    }
    return portfolio.filter(p => 'amount' in p)
        .reduce((acc, p) => acc + p.amount, 0);
}

function* getPortfolio(filename) {
    /* invoke a standard async callback API by wrapping it in a thunk */
    const csv = yield cb => fs.readFile(filename, "utf-8", cb);

    return csv.split('\n')
        .map(line => line.split(','))
        .map(f => ({symbol: f[0], qty: f[1]}))
        .filter(x => !!x.symbol);
}

function* getQuote(sym) {
    /* invoke a promise-based API */
    const qstr = yield rp(`https://www.google.com/finance/info?q=${sym}`),
        quote = JSON.parse(qstr.slice(qstr.indexOf('[')));
    return +quote[0].l_cur;
}

/* kick everything off */
run(computePortfolio("foo.csv"))
    .then(x => console.log("Portfolio value", x))
    .catch(x => console.log("Error", x));

