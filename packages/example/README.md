# API Example

This is an example showing QueueRun and various capabilities: HTTP API, queues, etc.

To test locally, in terminal window, run the dev server:

```bash
npx queue-run dev
```

Open your browser to http://localhost:8000 to see instructions, and use CURL to create, delete, list bookmarks.

For production, pick a project name and deploy:

```bash
npx queue-run deploy
curl [\^ see URL above]
```