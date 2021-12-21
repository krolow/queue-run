#!/usr/bin/env bash
set -eo pipefail

export AWS_REGION="us-east-1"

readonly archive="runtime.zip"
readonly layer_name="queue-run-runtime"
readonly profile="queuerun"

readonly account_id="122210178198"
readonly domain_name="queue.run"
readonly env_vars=""
readonly lambda_memory_size=128
readonly lambda_name="queuerun-gateway"
readonly lambda_runtime=nodejs14.x
readonly lambda_timeout=10
readonly role_name="queuerun-gateway"
readonly distribution_id="E6K2AQKPW7FJN"
readonly alias_name="${lambda_name}-current"


function build_layer() {
  echo -e "\033[34m  Building $layer_name …  \033[0m"
  rm -rf .build
  mkdir -p .build/nodejs

  yarn build
  cp dist/runtime.cjs.production.min.js .build/nodejs/index.js

  echo -e "\033[34m  Installing production dependencies …  \033[0m"
  cp package.json .build/package.json
  cd .build
  yarn install --prod
  mv node_modules nodejs/
  cd -
}

function zip_layer() {
  echo -e "\033[34m  Generating archive $archive …  \033[0m"
  cd .build
  zip -q -r "$archive" nodejs/*
  cd -
  echo -e "\033[32m  $(du -hs .build/$archive)  \033[0m"
}

function upload_layer() {
  echo -e "\033[34m  Publishing layer $layer_name …  \033[0m"
  local layer_version_arn=$(
  aws lambda publish-layer-version  \
    --layer-name "$layer_name" \
    --description "Node.js runtime for QueueRun" \
    --zip-file "fileb://.build/$archive" \
    --compatible-runtimes "nodejs12.x" "nodejs14.x" \
    --compatible-architectures "arm64" "x86_64"  \
    --profile $profile | jq -r '.LayerVersionArn'
  )
  echo "ARN: $layer_version_arn"

  echo -e "\033[32m  Published new version of $lambda_name  \033[0m\n"
}

function run() {
  build_layer
  zip_layer
  upload_layer

  echo -e "\033[32m  Done.  Have a nice day!  \033[0m\n"
}

run

