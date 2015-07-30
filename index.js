/*!
 * promistreamus - Convert Stream into an Iterator yielding value promises
 * Copyright (c) 2015 Yuri Astrakhan <YuriAstrakhan@gmail.com>
 * MIT Licensed
 * Author: YuriAstrakhan@gmail.com
 */

var BBPromise = require('bluebird');

/**
 * Transform stream into an iterator that yields Promises.
 * @param streamOrFunc function that will return a stream object, or promise of a stream
 * @param selectorFunc optional function that can convert data that came from the stream into the promise value.
 *        If undefined is returned, the value will not be yielded.
 * @returns {Function} Iterator function that will produce a Promise each time it is called.
          Streaming may be canceled by calling cancel() on the returned value.
 */
module.exports = function(streamOrFunc, selectorFunc) {
    var readablePromise = BBPromise.pending(),
        isDone = false,
        error, stream;

    var p = typeof streamOrFunc === "function" ? BBPromise.try(streamOrFunc) : BBPromise.resolve(streamOrFunc);
    p.then(function(val) {
        stream = val
            .on('readable', function () {
                // Notify waiting promises that data is available,
                // and create a new one to wait for the next chunk of data
                readablePromise.resolve(true);
                readablePromise = BBPromise.pending();
            })
            .on('end', function () {
                isDone = true;
                readablePromise.resolve(true);
            })
            .on('error', function (err) {
                error = err;
                readablePromise.reject(err);
            });
    }).catch(function(err) {
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
        while ((value = stream.read())) {
            res = selectorFunc ? selectorFunc(value) : value;
            if (res === undefined)
                continue;
            return res;
        }
        return undefined;
    };

    var iterator = function () {
        return BBPromise
            .try(readStream)
            .then(function(value) {
                return value === undefined ? readablePromise.promise.then(readStream) : value;
            })
            .then(function(value) {
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
        stream.pause();
        if (!error)
            error = new BBPromise.CancellationError();
        readablePromise.cancel();
    };

    return iterator;
};
