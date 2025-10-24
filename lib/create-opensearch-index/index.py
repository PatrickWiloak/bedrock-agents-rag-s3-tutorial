import json
import boto3
import urllib3
from urllib.parse import urlparse
import time

http = urllib3.PoolManager()

def handler(event, context):
    """
    Custom resource handler to create OpenSearch Serverless index for Bedrock Knowledge Base
    """
    print(f"Received event: {json.dumps(event)}")

    request_type = event['RequestType']
    properties = event['ResourceProperties']

    collection_endpoint = properties['CollectionEndpoint']
    index_name = properties['IndexName']

    # Parse the endpoint to get just the hostname
    parsed = urlparse(collection_endpoint)
    host = parsed.netloc if parsed.netloc else collection_endpoint.replace('https://', '').replace('http://', '')

    try:
        if request_type in ['Create', 'Update']:
            # Retry logic for index creation (data access policies are eventually consistent)
            max_retries = 10
            retry_delay = 20  # seconds

            # Initial wait for data access policy to propagate
            print(f"Initial wait: 60 seconds for data access policy propagation...")
            time.sleep(60)

            index_url = f"https://{host}/{index_name}"
            index_body = {
                "settings": {
                    "index": {
                        "knn": True,
                        "number_of_shards": 2,
                        "number_of_replicas": 0
                    }
                },
                "mappings": {
                    "properties": {
                        "bedrock-knowledge-base-default-vector": {
                            "type": "knn_vector",
                            "dimension": 1024,
                            "method": {
                                "name": "hnsw",
                                "engine": "faiss",
                                "parameters": {}
                            }
                        },
                        "AMAZON_BEDROCK_TEXT_CHUNK": {
                            "type": "text"
                        },
                        "AMAZON_BEDROCK_METADATA": {
                            "type": "text",
                            "index": False
                        }
                    }
                }
            }

            # Use AWS SigV4 signing for the request
            from botocore.auth import SigV4Auth
            from botocore.awsrequest import AWSRequest

            session = boto3.Session()
            credentials = session.get_credentials()
            region = session.region_name or 'us-east-1'

            # Get and log the Lambda execution role for debugging
            import os
            lambda_role_arn = os.environ.get('AWS_EXECUTION_ENV', 'Unknown')
            print(f"Lambda execution environment: {lambda_role_arn}")
            print(f"AWS Region: {region}")
            print(f"OpenSearch host: {host}")

            for attempt in range(1, max_retries + 1):
                print(f"Attempt {attempt}/{max_retries}: Creating index at {index_url}")

                request = AWSRequest(
                    method='PUT',
                    url=index_url,
                    data=json.dumps(index_body),
                    headers={'Content-Type': 'application/json'}
                )

                SigV4Auth(credentials, 'aoss', region).add_auth(request)

                response = http.request(
                    'PUT',
                    index_url,
                    body=json.dumps(index_body),
                    headers=dict(request.headers)
                )

                print(f"Response status: {response.status}")
                print(f"Response body: {response.data.decode('utf-8')}")

                if response.status in [200, 201]:
                    print("Index created successfully!")
                    break
                elif response.status == 400 and 'already exists' in response.data.decode('utf-8').lower():
                    print("Index already exists, continuing...")
                    break
                elif response.status == 403:
                    if attempt < max_retries:
                        print(f"403 Forbidden - data access policy may still be propagating. Waiting {retry_delay} seconds before retry {attempt + 1}...")
                        time.sleep(retry_delay)
                    else:
                        raise Exception(f"Failed to create index after {max_retries} attempts: 403 Forbidden - {response.data.decode('utf-8')}")
                else:
                    raise Exception(f"Failed to create index: {response.status} - {response.data.decode('utf-8')}")

            send_response(event, context, 'SUCCESS', {
                'IndexName': index_name,
                'CollectionEndpoint': collection_endpoint
            })

        elif request_type == 'Delete':
            # Don't delete the index on stack deletion - let Bedrock handle it
            print("Skipping index deletion - will be cleaned up with collection")
            send_response(event, context, 'SUCCESS', {})

    except Exception as e:
        print(f"Error: {str(e)}")
        send_response(event, context, 'FAILED', {}, str(e))


def send_response(event, context, status, data, reason=None):
    """Send response to CloudFormation"""
    response_body = {
        'Status': status,
        'Reason': reason or f'{status}',
        'PhysicalResourceId': event.get('PhysicalResourceId', f"opensearch-index-{event['ResourceProperties']['IndexName']}"),
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'Data': data
    }

    print(f"Sending response: {json.dumps(response_body)}")

    http.request(
        'PUT',
        event['ResponseURL'],
        body=json.dumps(response_body),
        headers={'Content-Type': ''}
    )
