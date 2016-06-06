'use strict';

var assert = require('assert');
var streamObj = require('stream');
var promistreamus = require('../promistreamus');
var _ = require('underscore');
var Promise = require('bluebird');

describe('Tests', function() {

    Promise.config({
        warnings: true,
        longStackTraces: true
    });

    var asPromises = function (values, delay) {
        if (delay === false) {
            return values;
        } else if (delay === 0) {
            return values.map(function (v) {
                return Promise.resolve(v);
            });
        } else {
            return values.map(function (v) {
                return Promise.delay(1, v);
            });
        }
    };

    function MockObjStream(values) {
        var stream = new streamObj.Readable({objectMode: true});
        var pos = 0;
        stream._read = function (size) {
            while (pos < values.length) {
                if (!stream.push(values[pos++])) {
                    break;
                }
            }
            if (pos === values.length) {
                stream.push(null);
                pos++; // emit 'end' just once
            }
        };
        this.stream = stream;
    }

    function makeIter(values, delay) {
        return promistreamus(new MockObjStream(asPromises(values, delay)).stream);
    }

    function flatIter(values, delay) {
        var pos = 0;
        return promistreamus.flatten(function () {
            if (pos < values.length) {
                return makeIter(values[pos++], delay);
            } else {
                return undefined;
            }
        });
    }

    function assertInOrder(expectedValues, iterator) {
        var pos = 0;
        var processor = function() {
            return iterator().then(function(value) {
                if (value === undefined) {
                    assert.equal(pos, expectedValues.length, 'finished early');
                    return;
                }
                assert(pos < expectedValues.length, 'too many values');
                assert.equal(value, expectedValues[pos++], 'unexpected value');

                return processor();
            });
        };
        return processor().catch(function(err) {
            assert.fail(err);
        });
    }

    function assertParallel(expectedValues, iterator) {
        var valuePromises = expectedValues.map(function (expectedVal) {
            iterator().then(function (val) {
                assert.equal(val, expectedVal);
            });
        });
        valuePromises.push(iterator().then(function(val){
            assert.equal(val, undefined, 'has extras');
        }));

        return Promise.all(valuePromises).catch(function(err) {
            assert.fail(err);
        });
    }

    it('iteration', function() {

        function test(values) {
            return Promise.resolve(true)
                .then(function () {return assertInOrder(values, makeIter(values, false))})
                .then(function () {return assertInOrder(values, makeIter(values, 0))})
                .then(function () {return assertInOrder(values, makeIter(values, true))})
                .then(function () {return assertParallel(values, makeIter(values, false))})
                .then(function () {return assertParallel(values, makeIter(values, 0))})
                .then(function () {return assertParallel(values, makeIter(values, true))});
        }

        return Promise.resolve(true)
            .then(function () {return test([])})
            .then(function () {return test([''])})
            .then(function () {return test([{}])})
            .then(function () {return test([0])})
            .then(function () {return test([{a:0}])})
            .then(function () {return test([1,2,3])})
            .then(function () {return test(_.range(0, 100))});
    });

    it('flatten', function() {
        function test(expValues, values) {
            return Promise.resolve(true)
                .then(function () {return assertInOrder(expValues, flatIter(values, false))})
                .then(function () {return assertInOrder(expValues, flatIter(values, 0))})
                .then(function () {return assertInOrder(expValues, flatIter(values, true))})
                .then(function () {return assertParallel(expValues, flatIter(values, false))})
                .then(function () {return assertParallel(expValues, flatIter(values, 0))})
                .then(function () {return assertParallel(expValues, flatIter(values, true))});
        }

        return Promise.resolve(true)
            .then(function () {return test([1,2,3], [[1,2,3]])})
            .then(function () {return test([1,2,3], [[1],[2],[3]])})
            .then(function () {return test([1,2,3], [[],[1,2],[],[],[3]])});
    });

    it('select', function() {
        function test(expValues, values, filter) {
            return Promise.resolve(true)
                .then(function () {return assertInOrder(expValues, promistreamus.select(makeIter(values, false), filter))})
                .then(function () {return assertInOrder(expValues, promistreamus.select(makeIter(values, 0), filter))})
                .then(function () {return assertInOrder(expValues, promistreamus.select(makeIter(values, true), filter))});
        }

        var filter = function (val) {
            return val <= 0 ? undefined : val * 2;
        };

        return Promise.resolve(true)
            .then(function () {return test([], [], filter)})
            .then(function () {return test([], [-1], filter)})
            .then(function () {return test([], [0,-1], filter)})
            .then(function () {return test([2], [1], filter)})
            .then(function () {return test([2,4], [1,2], filter)})
            .then(function () {return test([2], [0,1], filter)})
            .then(function () {return test([2,4,6], [0,1,-1,2,3], filter)});
    });
});
