# Gateway

Client applications send requests to the Gateway, which forwards them to the appropriate backend Lambda.

```
Client (your code) ->
  Gateway -> Backend Lambda ->
    HTTP route/queue (your code)
```

Each branch has a unique sub-domain and Lambda referenced by alias. AWS limits how many domains/routes/Lambdas we can manage on a single account. We can't deploy an API Gateway for each branch.

Instead, we have one API Gateway and Lambda (this one) that handle all requests for `*.queue.run` (and in the future, custom domains).

The Gateway runs on CloudFront (aka Lambda@Edge), close to the client, so it doesn't introduce unwanted latency.

(Earlier version ran as API Gateway, and this configuration is still supported)

For default branches, the sub-domain does not include the branch name. For custom domains, the URL does not contain the project ID. So the Gateway needs to perform one lookup against the database.
