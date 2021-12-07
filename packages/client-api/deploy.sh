#!/usr/bin/env bash
set -eo pipefail

readonly profile="labnotes"
readonly account_id="122210178198"
readonly lambda_name="EdgeClientAPI"
readonly role_name="EdgeClientAPI"
readonly distribution_id="E2VIAG7BJCQTZS"
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

  echo
}

function upload() {
  echo -e "\033[34m  Generating archive …  \033[0m"
  cd .build
  zip -r lambda.zip *
  cd -

  echo -e "\033[34m  Making configuration changes …  \033[0m"
  aws lambda update-function-configuration --function-name "$lambda_name" \
    --handler "index.handler" --runtime "nodejs12.x" \
    --role "arn:aws:iam::$account_id:role/service-role/$role_name" \
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

  echo -e "\033[32m  Published new version of $lambdaName  \033[0m\n"
}

function update() {
  # https://stackoverflow.com/questions/62655805/how-to-update-lambdaedge-arn-in-cloudfront-distribution-using-cli

  echo -e "\033[34m  Finding latest version …  \033[0m"
  readonly lambda_arn=$(
    aws lambda list-versions-by-function \
      --function-name "$lambda_name" \
      --query "max_by(Versions, &to_number(to_number(Version) || '0'))" \
      --profile $profile --region $region \
    | jq -r '.FunctionArn'
  )
  echo -e "\033[34m  Latest version $lambda_arn  \033[0m"

  echo -e "\033[34m  Modifying CF distribution …  \033[0m"
  readonly original=$(mktemp)
  readonly modified=$(mktemp)

  aws cloudfront get-distribution-config --id "$distribution_id" \
    --profile $profile --region $region \
    > "$original"

  readonly etag=$(jq -r '.ETag' < "$original")

  cat "$original" \
    | jq '(.DistributionConfig.DefaultCacheBehavior | .LambdaFunctionAssociations.Items[] | select(.EventType=="viewer-request") | .LambdaFunctionARN ) |= "'"$lambda_arn"'"' \
    | jq '.DistributionConfig' \
    > "$modified"

  aws cloudfront update-distribution --id "$distribution_id" \
    --distribution-config "file://$modified" --if-match "$etag" \
    --profile $profile --region $region  > /dev/null

  echo -e "\033[32m  Modified CF distribution  \033[0m\n"
}

build
upload
update
echo -e "\033[32m  Done.  Have a nice day!  \033[0m\n"