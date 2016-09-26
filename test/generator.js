const assert = require('assert');
const run = require('../gentrify').run;

function ajax_get(url, error, cb) {
    return cb ? _ajax_get(x => cb(null, x), cb) : new Promise(_ajax_get);
    
    function _ajax_get(resolve, reject) {
        if (error === "exception") throw new Error("ajax exception");
        setTimeout(function() {
            if (error === "string") {
                return reject("ajax error string");
            } else if (error) {
                return reject(new Error("ajax Error instance"));
            } else {
                var res = url ? `{"source": "${url}", "data": ["able", "baker", "charlie"]}` : '';
                return resolve(res);
            }
        }, 10);
    }
}

function* get_url(url, method="callback", error=false, ...args) {
    var x;

    if (method === "promise") {
        x = yield ajax_get(url, error);
    } else if (method === "callback") {
        x = yield cb => ajax_get(url, error, cb);
    } else if (method === "generator") {
        if (error === "exception") {
            throw new Error("ajax exception");
        } else if (error) {
            const msg = (error == "string") ? "error string" : "Error instance";
            return new Error(`ajax ${msg}`);
        } else {
            x = url ? `{"source": "${url}", "data": ["able", "baker", "charlie"]}` : '';
        }
    } else {
        throw new Error("Unknown method");
    }
    return x;
}

function* get_json(url, ...args) {
    var data = yield get_url(url, ...args);
    return JSON.parse(data);
    /* will throw an exception if data was improper */
}

function* find_person(name, ...args) {
    var res = yield get_json("http://foo.bar/list", ...args),
        data = res.data;
    return data.indexOf(name) !== -1;
}

describe("gentrify - functional tests", find_test);

function find_test() {
    const methods = ["promise", "callback", "generator"],
        errors = [
            {type: "string", msg: "ajax error string"},
            {type: "exception", msg: "ajax exception"},
            {type: "default", msg: "ajax Error instance"}
        ],
        tests = [
            {args: ["baker"], expected: true},
            {args: ["bakerloo"], expected: false}
        ];

    describe("Straight line", function() {
        for (const m of methods) {
            for (const t of tests) {
                it(`should return ${t.expected} when yielding ${m}` , function() {
                    return run(function* () {
                        var x = yield find_person(...t.args, m);
                        assert(x === t.expected);
                    }());
                });
            }
        }
    });

    describe("Error handling", function() {
        for (const m of methods) {
            for (const e of errors) {
                it(`should return ${e.msg} when yielding ${m}`, function() {
                    return run(function* () {
                        try {
                            var x = yield find_person("able", m, e.type);
                            assert(false); /* should not reach here */
                        } catch (err) {
                            assert(err.message == e.msg);
                        }
                    }());
                });
            }
        }
    });
}
