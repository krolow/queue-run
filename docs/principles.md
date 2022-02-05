# Guiding Principles

QueueRun is the back-end I want to have in every project I’m working on. 


## Ergonomics

Get started in minutes, master in days. Success means not having to think about it or learn new concepts. Above all, it should be a blast to use.

The framework gives you a logical file structure that mirrors your API and backend capabilities.

Documentation is UX: everything you need to know is documented, including best practices for building scalable web back-ends.

TypeScript helps understand the shape of things and provides guidance. Coupled with self-referencing URL templates and queues to keep your code DRY and avoid common naming mistakes.

Common tasks — parsing request documents, gating with access, request and error logging, setting up custom domains, etc — are handled for you.


## Zero-ops

You don’t have to worry about infrastructure. Let it deal with scaling up and down. Your code is all you need, no configuration.

The platform is serverless: AWS Lambda + API Gateway + SQS + DynamoDB + CloudWatch. You don’t have to set up or configure any of the services. It scales to the limit of your AWS account.

You do get control over things that matter. You can watch the production log, restart failed jobs, manage the concurrency of your functions, limit execution timeout, look at usage metrics.

QueueRun will guide you through the steps necessary to set up a custom domain for your backend.


## Back-ends Have State

This includes real-time messaging (WebSocket) and async notifications (Web Push), and background workloads with standard and FIFO queues, and schedules jobs.

This is the main difference between QueueRun and front-end frameworks like Next.js, Remix, etc. Your back-end can run background workloads (queues and schedules), and communicate asynchronously (WebSocket and Web Push).


## From The Web

Designed to support web applications and use familiar web technologies.

QueueRun supports HTTP, WebSocket, and Web Push. It can handle JSON and HTML forms, output XML (RSS, Sitemap), verify JWT tokens, fill-in URL templates.

And even though it runs on the server, it opts to use browser APIs like Fetch, Crypto, File, Abort Signal, console.log.


## Speed Of Iteration

The thing that matters most is the speed at which you can think, write, and deploy new features that add value to your customers.

QueueRun focuses on getting you to deploy earlier, rather than shedding another millisecond on response time.

It’s not slow, AWS is fast enough for most applications, but it doesn’t make you work harder to max out every CPU cycle. Instead, it makes you work less, so you can focus on the code and not worry about the infrastructure.

You should be able to go from “I wrote some code” to “now running in production” in under 2 minutes.


## Batteries Included

Every backend needs request and error logging. Every API needs authentication. JWT needs token verification. REST needs URL templates. WebSocket needs to track connections.

You get the point.

Adding this in every project is a waste of time. Boilerplates help with setup but won't upgrade your project over time.

All these common tasks should come built-in. You can extend them, you can replace them, and you can opt-out if you want.


## Branches > Staging

Serverless means never having to worry about a QA, staging, and canary. Deploy as many versions as you want.

The same way Git allows you to work on multiple feature branches, QueueRun allows you to have multiple branches online at the same time.
