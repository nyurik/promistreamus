/*!
 * promistreamus - Convert Stream into an Iterator yielding value promises
 * Copyright (c) 2015 Yuri Astrakhan <YuriAstrakhan@gmail.com>
 * MIT Licensed
 * Author: YuriAstrakhan@gmail.com
 */

var Promise = require('bluebird');

/**
 * BlueBird has made Promise.pending() obsolete, but that makes working with streams
 * very difficult, so introducing a simple workaround.
 * @constructor
 */
function Deferred() {
    var self = this;
    self.promise = new Promise(function (resolve, reject) {
        self.resolve = resolve;
        self.reject = reject;
    });
}

/**
 * Transform stream into an iterator that yields Promises.
 * @param {Stream|Function} streamOrFunc function that will return a stream object, or promise of a stream. If missing, the resulting
 *        object needs to be initialized with init() call
 * @param {Function} [selectorFunc] optional function that can convert data that came from the stream into the promise value.
 *        If undefined is returned, the value will not be yielded.
 * @returns {Function} Iterator function that will produce a Promise each time it is called.
          Streaming may be canceled by calling cancel() on the returned value.
 */
module.exports = function(streamOrFunc, selectorFunc) {
    var readablePromise = new Deferred(),
        initPromise,
        isDone = false,
        error, stream;

    var prepareStream = function (strm) {
        stream = strm
            .on('readable', function () {
                // Notify waiting promises that data is available,
                // and create a new one to wait for the next chunk of data
                readablePromise.resolve(true);
                readablePromise = new Deferred();
            })
            .on('end', function () {
                isDone = true;
                readablePromise.resolve(true);
            })
            .on('error', function (err) {
                error = err;
                readablePromise.reject(err);
            });
        initPromise = undefined;
    };

    var p;
    if (!streamOrFunc) {
        initPromise = new Deferred();
        p = initPromise.promise.then(function(streamOrFunc) {
            return typeof streamOrFunc === "function" ? streamOrFunc() : streamOrFunc;
        }).then(prepareStream);
    } else if (typeof streamOrFunc === "function") {
        p = Promise.try(streamOrFunc).then(prepareStream);
    } else {
        p = Promise.try(function () {
            return prepareStream(streamOrFunc)
        });
    }
    p.catch(function (err) {
        error = err;
        readablePromise.reject(err);
    });

    var readStream = function () {
        if (error) {
            // TODO: decide if we should exhaust the stream before reporting the error or error out right away
            throw error;
        } else if (!stream) {
            return undefined;
        }
        var value;
        while ((value = stream.read()) !== null) {
            res = selectorFunc ? selectorFunc(value) : value;
            if (res === undefined)
                continue;
            return res;
        }
        return undefined;
    };

    var iterator = function () {
        var res = !initPromise
            ? Promise.try(readStream)
            : initPromise.promise.then(readStream);
        return res
            .then(function (value) {
                return value === undefined ? readablePromise.promise.then(readStream) : value;
            })
            .then(function (value) {
                if (value !== undefined || isDone) {
                    return value;
                }
                // If we are here, the current promise has been triggered,
                // but by now other "threads" have consumed all buffered rows,
                // so start waiting for the next one
                // Note: there is a minor inefficiency here - readStream is called twice in a value, but its a rare case
                return iterator();
            });
    };

    iterator.cancel = function() {
        if (initPromise) {
            initPromise.promise.cancel();
        } else {
            stream.pause();
        }
        if (!error)
            error = new Promise.CancellationError();
        readablePromise.promise.cancel();
    };

    if (initPromise) {
        // If streamOrFunc has not been given, allow future initialization
        iterator.init = function(streamOrFunc) {
            initPromise.resolve(streamOrFunc);
            delete iterator.init; // Single invocation only
        };
    }

    return iterator;
};


/**
 * Converts and filters all values of an iterator using the converter function.
 * If converter returns undefined, the value is skipped.
 * NOTE: This function might not work as expected if the next value is requested before the previous is resolved.
 * @param {Function} iterator a promistreamus-style iterator function
 * @param {Function} converter a function that takes a value and returns a value or a promise of a value.
 *                  If the result resolves as undefined, it will be skipped.
 * @returns {Function} a promistreamus-style iterator function
 */
module.exports.select = function(iterator, converter) {
    var selector = function () {
        return iterator().then(function (val) {
            if (val === undefined) {
                return val;
            }
            var newVal = converter(val);
            if (newVal === undefined) {
                return selector();
            }
            return newVal;
        });
    };
    return selector;
};

/**
 * Flatten multiple promistreamus iterators of items into one iterator of items
 * @param {Function} iterator is a "stream of streams" function - each call to it must return a Promise of an iterator function.
 * @returns {Function} a promistreamus-style iterator function
 */
module.exports.flatten = function(iterator) {
    var subIterator = false;
    var isDone = false;
    var getNextValAsync = function() {
        if (isDone)
            return Promise.resolve(undefined);
        if (!subIterator) {
            subIterator = Promise.try(iterator);
        }
        var currentSubIterator = subIterator;
        return currentSubIterator.then(function(iter) {
            if (!iter) {
                isDone = true;
                return undefined;
            }
            return iter().then(function(val) {
                if (val !== undefined) {
                    return val;
                }
                if (currentSubIterator === subIterator) {
                    subIterator = Promise.try(iterator);
                }
                return getNextValAsync();
            });
        });
    };
    return getNextValAsync;
};
