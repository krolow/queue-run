#!/usr/bin/env bash
set -eo pipefail

export AWS_REGION="us-east-1"

readonly account_id="122210178198"
readonly archive="gateway.zip"
readonly domain_name="queue.run"
readonly lambda_memory_size=128
readonly lambda_name="queuerun-gateway"
readonly lambda_runtime=nodejs14.x
readonly lambda_timeout=5
readonly profile="queuerun"
readonly role_name="queuerun-gateway"


function build_lambda() {
  echo -e "\033[34m  Building $lambdaName …  \033[0m"
  rm -rf .build
  mkdir .build
  yarn build
  cp dist/gateway.cjs.production.min.js .build/index.js

  echo -e "\033[34m  Installing production dependencies …  \033[0m"
  cp package.json .build/package.json
  cd .build
  yarn install --prod
  cd -
}

function zip_lambda() {
  echo -e "\033[34m  Generating archive $archive …  \033[0m"
  cd .build
  zip -q -r "$archive" *
  cd -
  echo -e "\033[32m  $(du -hs .build/$archive)  \033[0m"
}

function update_policy() {
  readonly role_arn=$(aws iam get-role --role-name "$role_name" --profile $profile | jq ".Role.Arn")

  if [[ -z "$role_arn" ]]; then
    echo -e "\033[34m  Creating role $role_name …  \033[0m"
    aws iam create-role --role-name "$role_name" \
      --assume-role-policy-document "file://config/assume_role.json" \
      --profile $profile | jq -r ".Role.Arn"
  fi

  echo -e "\033[34m  Updating role $role_name …  \033[0m"
  aws iam put-role-policy --role-name "$role_name" \
    --policy-name "$role_name" \
    --policy-document "file://config/policy.json" \
    --profile $profile
}

function upload_lambda() {
  readonly lambda_arn=$(aws lambda get-function-configuration --function-name "$lambda_name" --profile $profile | jq ".FunctionArn")
  if [[ -z "$role_arn" ]]; then
    echo -e "\033[34m  Creating function …  \033[0m"
    aws lambda create-function --function-name "$lambda_name" \
      --zip-file "fileb://.build/$archive" --publish \
      --role "arn:aws:iam::$account_id:role/$role_name" \
      --handler "index.handler" --runtime $lambda_runtime \
      --memory-size $lambda_memory_size --timeout $lambda_timeout \
      --publish \
      --profile $profile \
      | jq -r '.FunctionArn'

  else

    echo -e "\033[34m  Making configuration changes …  \033[0m"
    aws lambda update-function-configuration --function-name "$lambda_name" \
      --role "arn:aws:iam::$account_id:role/$role_name" \
      --handler "index.handler" --runtime $lambda_runtime \
      --memory-size $lambda_memory_size --timeout $lambda_timeout \
      --profile $profile \
      | jq -r '.FunctionArn'

    echo -e "\033[34m  Wait for changes to take effect …  \033[0m"
    sleep 5

    echo -e "\033[34m  Uploading new code …  \033[0m"
    aws lambda update-function-code --function-name "$lambda_name" \
      --zip-file "fileb://.build/$archive" --publish \
      --profile $profile \
      | jq -r '.FunctionArn'

  fi

  echo -e "\033[34m  Wait for changes to take effect …  \033[0m"
  sleep 5
  echo -e "\033[32m  Published new version of $lambdaName  \033[0m\n"
}

function add_to_api_gateway() {
  readonly lambda_arn=$(aws lambda get-function-configuration --function-name "$lambda_name" --profile $profile | jq -r '.FunctionArn')
  readonly api_id=$(aws apigatewayv2 get-apis  --profile labnotes --region us-east-1 | jq -r '.Items[] | select(.Name == "queuerun-gateway") | .ApiId')
  readonly mapping=$(aws apigatewayv2 get-api-mappings --domain-name "*.$domain_name" --profile $profile | jq '.Items[] | select(.ApiId == "gt7szcvbg2") | .Stage') 

  aws apigatewayv2 create-api-mapping \
    --domain-name "*.$domain_name" \
    --api-id "$api_id" --api-mapping-key "$lambda_name" --stage "\$default"  \
    --profile $profile

  echo -e "\033[34m  Add API Gateway invoke permission …  \033[0m"
  aws lambda add-permission \
    --statement-id apigateway \
    --action lambda:InvokeFunction \
    --function-name $lambda_arn \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:us-east-1:$account_id:$api_id/*/\$default" \
    --profile $profile || true

}


function run() {
  build_lambda && zip_lambda
  update_policy
  upload_lambda
  # add_to_api_gateway

  echo -e "\033[32m  Done.  Have a nice day!  \033[0m\n"
}

run
