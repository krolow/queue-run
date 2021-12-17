## Queue.Run Client API

Use this module to send messages to the server.

To install:

```
npm install @queue-run/client
or
yarn install @queue-run/client
```

You need the URL for the project, and an acces token, available from the dashboard.

```javascript
import client from '@queue-run/client';

const url = 'https://goose-bump.queue.run';
const token = '59RK9D...';

// Push message to the queue in one swift move
const { messageId } = await client({ url, token }).queue('my_queue', someObject);
console.log('Just pushed message %s', messageId);
```