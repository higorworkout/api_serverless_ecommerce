import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ApiGatewayManagementApi, DynamoDB, S3 } from 'aws-sdk';
import  * as AWSXray from 'aws-xray-sdk-core';
import { v4 as uuid } from 'uuid';
import { InvoiceTransactionRepository } from '/opt/nodejs/invoiceTransaction';
import { InvoiceTransactionStatus } from '/opt/nodejs/invoiceTransaction';
import { InvoiceWSService } from '/opt/nodejs/invoiceWSConnection';

AWSXray.captureAWS(require('aws-sdk'));

const invoicesDdb = process.env.INVOICES_DDB!;
const bucketName = process.env.BUCKET_NAME!;
const invoicesWsApiEndpoint = process.env.INVOICES_WS_API_ENDPOINT!.substring(6);

const s3Client = new S3();
const ddbClient = new DynamoDB.DocumentClient();
const apigwManagamentApi  = new ApiGatewayManagementApi({
    endpoint: invoicesWsApiEndpoint,
});

const invoiceTransactionRepository = new InvoiceTransactionRepository(ddbClient, invoicesDdb);
const invoicesWSService = new InvoiceWSService(apigwManagamentApi);


export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
   //TODO -  to be removed
    console.log(event);

    const lambdaRequestId = context.awsRequestId;
    const connectionId = event.requestContext.connectionId;
    if (!connectionId) {
        throw new Error("Connection ID is undefined");
    }

    console.log(`Lambda Request ID: ${lambdaRequestId}`);
    console.log(`Connection ID: ${connectionId}`);

    const key = uuid();
    const expires = 300;

    const signedUrlPut = await s3Client.getSignedUrlPromise('putObject', {
        Bucket: bucketName,
        Key: key,
        Expires: expires
    });

    // Create a new invoice transaction 
    const timestamp = Date.now();
    const ttl = ~~(timestamp / 1000 + 60 * 2);

    await invoiceTransactionRepository.createInvoiceTransaction({
        pk: `#transaction`,
        sk: key,
        ttl,
        requestId: lambdaRequestId,
        transactionStatus: InvoiceTransactionStatus.GENERATED,
        timestamp,
        connectionId,
        expiresIn: expires,
        endpoint: invoicesWsApiEndpoint,
    });


    // Send the signed URL to the client
    const postData = JSON.stringify({
        url: signedUrlPut,
        expires,
        transactionId: key,
    });

    await invoicesWSService.sendData(connectionId, postData);

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Hello from Invoice Get URL Lambda!',
            event,
        }),
    };
}