#!/usr/bin/env bash
set -eo pipefail

readonly profile="queue.run"
readonly account_id="122210178198"
readonly lambda_name="QueueRunClientAPI"
readonly role_name="QueueRunClientAPIRole"
readonly region="us-east-1"

function build() {
  echo -e "\033[34m  Building $lambdaName …  \033[0m"
  rm -rf .build
  mkdir .build
  yarn build
  cp dist/client-api.cjs.production.min.js .build/index.js

  echo -e "\033[34m  Installing production dependencies …  \033[0m"
  cp package.json .build/package.json
  cd .build
  yarn install --prod
  cd -

  echo -e "\033[34m  Generating archive …  \033[0m"
  cd .build
  zip -r lambda.zip *
  cd -

  echo -e "\033[32m  Built  \033[0m\n"
}

function upload() {
  echo -e "\033[34m  Making configuration changes …  \033[0m"
  aws lambda update-function-configuration --function-name "$lambda_name" \
    --handler "index.handler" --runtime "nodejs14.x" \
    --role "arn:aws:iam::$account_id:role/$role_name" \
    --profile $profile --region $region \
    | jq -r '.FunctionArn'

  echo -e "\033[34m  Wait for changes to take effect …  \033[0m"
  sleep 5

  echo -e "\033[34m  Uploading new code …  \033[0m"
  aws lambda update-function-code --function-name "$lambda_name" \
    --zip-file "fileb://.build/lambda.zip" --publish \
    --profile $profile --region $region \
    | jq -r '.FunctionArn'

  echo -e "\033[34m  Wait for changes to take effect …  \033[0m"
  sleep 5

  echo -e "\033[34m  Add API Gateway invoke permission …  \033[0m"
  aws lambda add-permission \
    --statement-id c45c27e2-1b63-5515-8ce7-4bb1d23e9ec4 \
    --action lambda:InvokeFunction \
    --function-name "arn:aws:lambda:us-east-1:$account_id:function:$lambda_name" \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:us-east-1:$account_id:k8mfahtd2d/*/\$default"

  echo -e "\033[32m  Published new version of $lambdaName  \033[0m\n"
}


build
upload

echo -e "\033[32m  Done.  Have a nice day!  \033[0m\n"