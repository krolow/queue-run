#!/usr/bin/env bash
set -eo pipefail

export AWS_REGION="us-east-1"

readonly account_id="122210178198"
readonly archive="gateway.zip"
readonly domain_name="queue.run"
readonly env_vars=""
readonly lambda_memory_size=128
readonly lambda_name="queuerun-gateway"
readonly lambda_runtime=nodejs14.x
readonly lambda_timeout=10
readonly profile="queuerun"
readonly role_name="queuerun-gateway"
readonly distribution_id="E6K2AQKPW7FJN"
readonly alias_name="${lambda_name}-current"


function build_lambda() {
  echo -e "\033[34m  Building $lambda_name …  \033[0m"
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
  local role_arn=$(aws iam get-role --role-name "$role_name" --profile $profile | jq -r ".Role.Arn")

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
  local lambda_arn=$(aws lambda get-function-configuration --function-name "$lambda_name" --profile $profile | jq -r ".FunctionArn")
  if [[ -z "$lambda_arn" ]]; then
    echo -e "\033[34m  Creating function $lambda_name …  \033[0m"
    local version=$(aws lambda create-function --function-name "$lambda_name" \
      --zip-file "fileb://.build/$archive" --publish \
      --role "arn:aws:iam::$account_id:role/$role_name" \
      --handler "index.handler" --runtime $lambda_runtime \
      --memory-size $lambda_memory_size --timeout $lambda_timeout \
      --environment "Variables={$env_vars}" \
      --publish \
      --profile $profile \
      | jq -r '.Version')

  else

    echo -e "\033[34m  Making configuration changes to $lambda_name …  \033[0m"
    aws lambda update-function-configuration --function-name "$lambda_name" \
      --role "arn:aws:iam::$account_id:role/$role_name" \
      --handler "index.handler" --runtime $lambda_runtime \
      --memory-size $lambda_memory_size --timeout $lambda_timeout \
      --environment "Variables={$env_vars}" \
      --profile $profile \
      | jq '.FunctionArn'

    echo -e "\033[34m  Wait for changes to take effect …  \033[0m"
    sleep 3

    echo -e "\033[34m  Uploading new code for $lambda_name …  \033[0m"
    local version=$(aws lambda update-function-code --function-name "$lambda_name" \
      --zip-file "fileb://.build/$archive" --publish \
      --profile $profile \
      | jq -r '.Version')

  fi

  echo -e "\033[34m  Aliasing $alias_name => $lambda_name:$version …  \033[0m"
  local alias_arn=$(aws lambda get-alias --function-name "$lambda_name" --name="$alias_name" --profile $profile | jq -r '.AliasArn')
  if [[ -z "$alias_arn" ]]; then
    aws lambda create-alias --function-name "$lambda_name" \
      --function-version $version --name $alias_name \
      --profile $profile | jq '.AliasArn'
  else
    aws lambda update-alias --function-name "$lambda_name" \
      --function-version $version --name $alias_name \
      --profile $profile | jq '.AliasArn'
  fi
  echo -e "\033[34m  Wait for function to become active …  \033[0m"
  sleep 3

  echo -e "\033[32m  Published new version of $lambdaName  \033[0m\n"
}

function add_to_api_gateway() {
  local lambda_arn=$(aws lambda get-function-configuration --function-name "$alias_name" --profile $profile | jq -r '.FunctionArn')
  local api_id=$(aws apigatewayv2 get-apis  --profile labnotes --region us-east-1 | jq -r '.Items[] | select(.Name == "queuerun-gateway") | .ApiId')
  local mapping=$(aws apigatewayv2 get-api-mappings --domain-name "*.$domain_name" --profile $profile | jq -r '.Items[] | select(.ApiId == "gt7szcvbg2") | .Stage') 

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

function update_lambda_edge()  {
  local version=$(aws lambda get-alias --function-name $lambda_name --name $alias_name --profile $profile | jq -r '.FunctionVersion')
  echo -e "\033[34m  Pointing CloudFront to $lambda_name version $version …  \033[0m"

  local filename="config/distribution.json"
  aws cloudfront get-distribution-config \
    --id $distribution_id > $filename --profile $profile
  local etag=$(cat $filename | jq -r '.ETag')
  local tmp=$(mktemp)
  cat $filename \
    | jq "del(.ETag) | (.DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations.Items[] | select(.LambdaFunctionARN | test(\"$lambda_name\"))).LambdaFunctionARN |= sub(\":[0-9]+\$\"; \":$version\") | .DistributionConfig" \
    > $tmp
  mv $tmp $filename
  aws cloudfront update-distribution \
    --id $distribution_id --distribution-config file://$filename \
    --if-match "$etag" \
    --profile $profile | jq ".Distribution.ARN"
}


function run() {
  build_lambda && zip_lambda
  update_policy
  upload_lambda
  update_lambda_edge

  echo -e "\033[32m  Done.  Have a nice day!  \033[0m\n"
}

run
