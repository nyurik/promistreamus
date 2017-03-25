# Promistreamus  [![Build Status](https://travis-ci.org/nyurik/promistreamus.svg?branch=master)](https://travis-ci.org/nyurik/promistreamus)
Convert Stream into an Iterator yielding promises of values

Allows `foreach` of promises for a stream:

```
// preudo-code
foreach ( promise in promistreamus(stream) ) {
    promise.then(function(value) { /* use the value */ });
}
```

Promistreamus converts stream's values into promises. This allows you to treat streams in a sync "pull" fashion, even if the stream values are not ready yet. Wrapping a stream with Promistreamus provides an iterator function. Calling it returns a thenable promise of a value. Once available, the promise is resolved with the value. When the stream ends, all pending promises are resolved with the `undefined` value. On error, all pending promises are rejected with that error.

## Using Promistreamus

``` js
var promistreamus = require("promistreamus");
var iterator = promistreamus(stream); // Create an iterator from a stream

// Stream item processing function
var processor = function() {
    // Get the promise of the next stream value from the iterator
    return iterator().then(function(value) {
        if (value === undefined) {
            // we are done, no more items in the stream
            return;
        }
        // Process the value
        ...
        return processor(); // Continue to the next item
    });
};

// Process stream one item at a time
processor().then(function() {
    // all items were successfully processed
}, function(err) {
    // processing failed
});
```

## Delayed initialization
In an edge case when iteration function is needed before the stream is available, promistreamus can be delay-created with an undefined call, and initialized later with `init(stream)` function.

``` js
var promistreamus = require("promistreamus");
// Create a non-initialized iterator which has .init(stream) method
var iterator = promistreamus();
...
// init() can be called even after the iterator function has been called
iterator.init(stream);
```

Note that if the filtering function is needed, it should still be passed as before:

``` js
var iterator = promistreamus(undefined, function(row) {...});
```


## Processing multiple values at once
The iterator function may be called more than once, without waiting for the first promise to be resolved.

``` js
// Process all items, 3 items at a time (example uses bluebird npm)
var threads = [processor(), processor(), processor()];
return Promise.all(threads).then(function() {
    // all items were successfully processed
}, function(err) {
    // processing failed
});
```

## Cancellation
Streaming can be stopped by calling cancel() function on the iterator. All pending promises will be rejected, and the stream will be paused.

``` js
iterator.cancel();
```

## Filtering and converting values of a promistreamus stream
One may wish to map all values of a given promistreamus stream by using a conversion function, and/or to filter them out.

``` js
var iterator = promistreamus(stream); // Create an iterator from a stream

var iterator2 = promistreamus.select(iterator, function (value) {
     // process the value, and either return a new value, a promise of a new value, or undefined to skip it
     return ...;
});
```

## Joining multiple streams
Given a promistreamus style stream of streams - an iterator function that returns promises of sub-iterators,
one may wish to present the values from all sub-iterators together, just like the .NET's LINQ SelectMany() function.

``` js
var items = promistreamus(stream); // Create an iterator from a stream

// Convert each value into a separate promistreamus iterator
var itemsOfItems = promistreamus.select(iterator, function (value) {
    return promistreamus(createStream(value));
});

// Flatten out all subitems
var flattenedItems = promistreamus.flatten(itemsOfItems);

```
