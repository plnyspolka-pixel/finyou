#!/usr/bin/env bash
# Wdraża kompresję wideo na AWS Lambda (idempotentne — ponowne uruchomienie
# aktualizuje kod i konfigurację, sekret zostaje ten sam).
#
#   aws login --remote --region eu-central-1 --profile finyou
#   bash services/video-transcoder/deploy.sh
#
# Zakłada: bucket S3 (stan zadań + wyniki zapasowe, kasowane po 2 dniach),
# rolę IAM, funkcję Lambda z Function URL (auth NONE + własny sekret Bearer),
# grupę logów (14 dni). Na końcu wypisuje VIDEO_TRANSCODER_URL i
# VIDEO_TRANSCODER_SECRET do sekretów Finance You.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$PATH"

PROFILE="${AWS_PROFILE:-finyou}"
REGION="${AWS_REGION:-eu-central-1}"
NAME="${FUNCTION_NAME:-finyou-video-transcoder}"
# Nowe konta mają limit pamięci Lambdy 3008 MB (≈ 2 vCPU); więcej po podniesieniu limitu.
MEMORY_MB="${MEMORY_MB:-3008}"
aws_() { aws --profile "$PROFILE" --region "$REGION" "$@"; }

ACCOUNT=$(aws_ sts get-caller-identity --query Account --output text)
BUCKET="${BUCKET:-finyou-video-transcoder-$ACCOUNT}"
ROLE="${NAME}-role"
echo "Konto $ACCOUNT, region $REGION, funkcja $NAME, bucket $BUCKET"

[ -s dist/function.zip ] || bash build.sh

# ── Bucket ──────────────────────────────────────────────────────────────────
if ! aws_ s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws_ s3api create-bucket --bucket "$BUCKET" \
    --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  echo "Bucket założony."
fi
aws_ s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws_ s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{
  "Rules": [
    {"ID": "jobs", "Status": "Enabled", "Filter": {"Prefix": "jobs/"}, "Expiration": {"Days": 2}},
    {"ID": "results", "Status": "Enabled", "Filter": {"Prefix": "results/"}, "Expiration": {"Days": 2}}
  ]}'

# ── Rola IAM ────────────────────────────────────────────────────────────────
if ! aws_ iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws_ iam create-role --role-name "$ROLE" --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]
  }' >/dev/null
  echo "Rola założona — czekam, aż IAM ją rozpropaguje…"
  sleep 12
fi
aws_ iam attach-role-policy --role-name "$ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
FUNCTION_ARN="arn:aws:lambda:$REGION:$ACCOUNT:function:$NAME"
aws_ iam put-role-policy --role-name "$ROLE" --policy-name "${NAME}-access" --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Effect\": \"Allow\", \"Action\": [\"s3:GetObject\", \"s3:PutObject\", \"s3:DeleteObject\"],
     \"Resource\": [\"arn:aws:s3:::$BUCKET/jobs/*\", \"arn:aws:s3:::$BUCKET/results/*\"]},
    {\"Effect\": \"Allow\", \"Action\": \"lambda:InvokeFunction\", \"Resource\": \"$FUNCTION_ARN\"}
  ]}"
ROLE_ARN=$(aws_ iam get-role --role-name "$ROLE" --query Role.Arn --output text)

# ── Logi ────────────────────────────────────────────────────────────────────
aws_ logs create-log-group --log-group-name "/aws/lambda/$NAME" 2>/dev/null || true
aws_ logs put-retention-policy --log-group-name "/aws/lambda/$NAME" --retention-in-days 14

# ── Kod i konfiguracja ──────────────────────────────────────────────────────
aws_ s3 cp dist/function.zip "s3://$BUCKET/deploy/function.zip" --only-show-errors

SECRET=""
if aws_ lambda get-function --function-name "$NAME" >/dev/null 2>&1; then
  SECRET=$(aws_ lambda get-function-configuration --function-name "$NAME" \
    --query 'Environment.Variables.TRANSCODER_SECRET' --output text)
  [ "$SECRET" = "None" ] && SECRET=""
fi
[ -n "$SECRET" ] || SECRET=$(openssl rand -hex 24)
ENV_JSON="{\"Variables\":{\"TRANSCODER_SECRET\":\"$SECRET\",\"BUCKET\":\"$BUCKET\",\"FFMPEG_PRESET\":\"${FFMPEG_PRESET:-medium}\"}}"

if aws_ lambda get-function --function-name "$NAME" >/dev/null 2>&1; then
  aws_ lambda update-function-code --function-name "$NAME" \
    --s3-bucket "$BUCKET" --s3-key deploy/function.zip >/dev/null
  aws_ lambda wait function-updated-v2 --function-name "$NAME"
  aws_ lambda update-function-configuration --function-name "$NAME" --role "$ROLE_ARN" \
    --runtime nodejs22.x --handler handler.handler --timeout 900 --memory-size "$MEMORY_MB" \
    --ephemeral-storage Size=4096 --environment "$ENV_JSON" >/dev/null
  echo "Funkcja zaktualizowana."
else
  for attempt in 1 2 3 4 5; do
    if aws_ lambda create-function --function-name "$NAME" --role "$ROLE_ARN" \
      --runtime nodejs22.x --handler handler.handler --architectures x86_64 \
      --timeout 900 --memory-size "$MEMORY_MB" --ephemeral-storage Size=4096 \
      --code "S3Bucket=$BUCKET,S3Key=deploy/function.zip" \
      --environment "$ENV_JSON" >/dev/null; then
      break
    fi
    [ "$attempt" = 5 ] && exit 1
    echo "Rola jeszcze niewidoczna dla Lambdy — ponawiam za 10 s…"; sleep 10
  done
  echo "Funkcja założona."
fi
aws_ lambda wait function-updated-v2 --function-name "$NAME"
# Kodowanie jest asynchroniczne: bez ponowień (stan i limit czasu pilnuje Finance You).
aws_ lambda put-function-event-invoke-config --function-name "$NAME" \
  --maximum-retry-attempts 0 --maximum-event-age-in-seconds 3600 >/dev/null

# ── Function URL ────────────────────────────────────────────────────────────
if ! aws_ lambda get-function-url-config --function-name "$NAME" >/dev/null 2>&1; then
  aws_ lambda create-function-url-config --function-name "$NAME" --auth-type NONE >/dev/null
fi
aws_ lambda add-permission --function-name "$NAME" --statement-id url-public \
  --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE \
  >/dev/null 2>&1 || true
aws_ lambda add-permission --function-name "$NAME" --statement-id url-invoke \
  --action lambda:InvokeFunction --principal "*" --invoked-via-function-url \
  >/dev/null 2>&1 || true
URL=$(aws_ lambda get-function-url-config --function-name "$NAME" --query FunctionUrl --output text)
URL="${URL%/}"

echo "Test /health:"
curl -fsS "$URL/health" && echo

cat <<OUT

Gotowe. Sekrety Finance You (Cloudflare / Lovable):
  VIDEO_TRANSCODER_URL=$URL
  VIDEO_TRANSCODER_SECRET=$SECRET
OUT
