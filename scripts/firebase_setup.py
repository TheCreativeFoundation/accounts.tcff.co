import os
import boto3

aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")

try:
    if not os.path.isfile("tcf-accounts-firebase-key.json"):
        session = boto3.session.Session(
            aws_access_key_id=aws_access_key_id, aws_secret_access_key=aws_secret_access_key
        )
        session.resource("s3").Bucket("tcf-accounts-key").download_file(
            "tcf-accounts-firebase-key.json", "tcf-accounts-firebase-key.json"
        )
        print("Amazon s3 download passed")
except Exception as e:
    print("downloading file from Amazon s3 failed...:"+str(e))