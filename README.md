# Promistreamus
Convert Stream into an Iterator yielding promises of values

Sometimes, you want to treat streams in a sync "pull" fashion, but the stream values might not be ready yet.
Promistreamus solves this by giving you an iterator function. Each call returns a thenable promise of a value.

Once the value is available, promise is resolved. If stream ends, promise is resolved with the `undefined` value. On error, all pending promises are rejected with that error.


## Using Promistreamus

``` js
var promistreamus = require("promistreamus");
var iterator = promistreamus(stream); // Create an iterator from a stream

// Set up the function to process values:
var processor = function() {
    return iterator().then(function(value) {
        if (value === undefined) {
            // we are done, no more items in the stream
            return;
        }
        // Process value
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

## Processing multiple values at once
The iterator function may be called more than once, without waiting for the first promise to be resolved.
``` js
// Process 3 items at the same time (using bluebird library)
var threads = [processor(), processor(), processor()];
return BBPromise.all(threads).then(function() {
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
