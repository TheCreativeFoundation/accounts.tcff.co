#!/bin/bash

# Install AWS CLI
curl "https://bootstrap.pypa.io/get-pip.py" -o "get-pip.py"
echo "level 1 done"
python get-pip.py
echo "level 2 done"
pip install awscli --ignore-installed six
echo "level 3 done"

# Install "zip"
apt-get update
echo "level 4 done"
apt-get install -y zip
echo "level 5 done"

# Zip up everything with the exception of node_modules (including dist)
ts=`date +%s`
echo "level 6 done"
fn="$EB_APP_NAME-$ts.zip"
echo "level 7 done"
find ./ -path '*/node_modules/*' -prune -o -path '*/\.git*' -prune -o -type f -print | zip $fn -@
echo "level 8 done"
S3_KEY="$S3_KEY/$fn"
echo "level 9 done"
# Copy the app to S3
aws s3 cp $fn "s3://$S3_BUCKET/$S3_KEY"
echo "level 10 done"

# Create a new version in eb
echo "Creating ElasticBeanstalk Application Version ..."
aws elasticbeanstalk create-application-version \
  --application-name $EB_APP_NAME \
  --version-label "$EB_APP_NAME-$ts" \
  --description "$EB_APP_NAME-$ts" \
  --source-bundle S3Bucket="$S3_BUCKET",S3Key="$S3_KEY" --auto-create-application
echo "level 11 done"

# Update to that version
echo "Updating ElasticBeanstalk Application Version ..."
aws elasticbeanstalk update-environment \
  --application-name $EB_APP_NAME \
  --environment-name $EB_APP_ENV \
  --version-label "$EB_APP_NAME-$ts"
echo "level 12 done"

echo "Done! Deployed version $EB_APP_NAME-$ts"