const assert = require('assert');
const run = require('../gentrify').run;

describe("gentrify - basic API", basic_api);

function basic_api() {
    it("should accept generator objects", function() {
        assert(run(function* (){}()) !== undefined);
    });
    it("should reject generator functions", function() {
        try {
            run(function* (){});
        } catch (e) {
            assert(e instanceof TypeError);
            assert(~e.message.indexOf("Not a generator"));
        }
    });
    it("should reject plain functions", function() {
        try {
            run(function(){});
        } catch (e) {
            assert(e instanceof TypeError);
            assert(~e.message.indexOf("Not a generator object"));
        }
    });
    it("should return a promise with no callback", function() {
        assert(run(function* () {}()) instanceof Promise);
    });
    it("should not return a promise if a callback is supplied", function() {
        assert(!(run(function* () {}(), cb => null) instanceof Promise));
    });
    it("should call the callback", function(done) {
        run(function* () {}(), cb => done());
    });
    it("should catch errors: promise", function() {
        return run(function* () {
            throw new SyntaxError("foo");
        }()).then(function() {
            throw new Error("boom");
        }, function(e) {
            assert(e instanceof SyntaxError);
        });
    });
    it("should catch errors: callback", function(done) {
        return run(function* () {
            throw new SyntaxError("foo");
        }(), function(e) {
            if (e instanceof SyntaxError) return done();
            done(new Error("boom"));
        });
    });
}
