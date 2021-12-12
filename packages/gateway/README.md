# Gateway

Client applications send requests to the Gateway, which forwards them to the appropriate backend Lambda.

```
Client -> Gateway -> Backend Lambda -> Your code
```

Each branch has its own unique host name and Lambda function. AWS limits how many domains/routes/Lambdas we can manage on one account. So we can't deploy the backend Lambda as an API Gateway endpoint.

Instead, we use this single Gateway Lambda that handles requests for all subdomains under `queue.run`, as well as custom project domains.

Since subdomains don't have to include the default branch name, it will lookup the project record in DynamoDB for each invocation.

The current implementation runs on us-east-1. This adds roundtrip latency if the client and backend run in the same region, which is not us-east-1.

Future implementation should run on Lambda@Edge, so the request is handled on the edge server closest to the client, and doesn't add undue latency.

However, Lambda@Edge has strict size restriction, and so we can't bundle the AWS SDK we need for accessing DynamoDB and Lambda invocation. We'll need a workaround.
