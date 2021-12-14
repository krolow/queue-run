# Runtime

The Runtime hosts your backend functions. It executes backend functions and provides them with shared services, like logging and authentication.

The Gateway invokes the Runtime directly using the Lambda API. It sends the HTTP request and expects an HTTP response.

Other event sources that invoke the Runtime include SQS and scheduler.

The Runtime starts by recognizing the invocation type and running the appropriate logic.


## HTTP

The Runtime convets the request to/from the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API).

If then maps the path to the appropriate backend function. If the path starts with `/api`, then it uses the HTTP routing table. If the path starts with `/queue`, then it uses the logic for pushing messages to SQS.


## SQS

Queue request are a subset of HTTP requests. The request is converted to Fetch API, and the outcome will be communicated with an HTTP status code.

The route has the queue name in it, and we make sure the queue exists for that project/branch, by looking up the queue URL. If the queue doesn't exist, that's a 404.

We follow the same rules for loading and merging middleware, starting with the queue, and working upwards to the `backend/queue` and `backend` directories.

If there's an authenticate method, that method is invoked. The user ID will be stored as a message attribute.

A message is then pushed to the queue. The request body is used as is, and the content type is added as message attribute.

When the message is received from the queue, the Runtime is invoked with an event that contains one or more message recordes, identified by the `eventSource` property.

That message is passed for processing by the message handler. There are two different strategies, depending on the queue type.

For regular queues:

 - All received messages are processed in parallel
 - The visibility of each message is set to the expected timeout
 - An abort signal will trigger after timeout
 - The module is loaded and the handler invoked with the message
 - If it completes successfully (and no timeout), the message is deleted
 - Otherwise, the message will return to the queue at the end of the visiblity period

For FIFO queues:

- Messages are split into groups based on group ID
- All groups are processed in parallel
- In each group, messages are processed in sequenece
- The visibility for all messages is extended to allow sequential processin
- Failing to process any message in the group, that and all following messages returned to the queue by resetting their visiblity
