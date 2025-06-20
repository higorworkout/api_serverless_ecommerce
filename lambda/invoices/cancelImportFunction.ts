import * as AWSXRay from 'aws-xray-sdk-core';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context  } from 'aws-lambda';
import { ApiGatewayManagementApi, DynamoDB } from 'aws-sdk';
import { InvoiceTransactionRepository, InvoiceTransactionStatus } from '/opt/nodejs/invoiceTransaction';
import { InvoiceWSService } from '/opt/nodejs/invoiceWSConnection';

AWSXRay.captureAWS(require('aws-sdk'));

const invoicesDdb = process.env.INVOICES_DDB!;
const invoicesWsApiEndpoint = process.env.INVOICES_WS_API_ENDPOINT!.substring(6);

const ddbClient = new DynamoDB.DocumentClient();
const apigwManagamentApi  = new ApiGatewayManagementApi({
    endpoint: invoicesWsApiEndpoint,
});

const invoiceTransactionRepository = new InvoiceTransactionRepository(ddbClient, invoicesDdb);
const invoiceWSService = new InvoiceWSService(apigwManagamentApi);

export async function handler(event: APIGatewayProxyEvent,context: any): Promise<void> {
    // to be removed

    const transactionId = JSON.parse(event.body!).transactionId as string;

    const lambdaRequestId = context.awsRequestId;

    const connectionId = event.requestContext.connectionId as string;

    console.log(`Connection id: ${connectionId} - lambda request id: ${lambdaRequestId}`);

    try {
        const invoiceTransaction = await invoiceTransactionRepository.getInvoiceTransaction(transactionId);

        if (invoiceTransaction.transactionStatus === InvoiceTransactionStatus.GENERATED) {
            await Promise.all([
                invoiceWSService.sendInvoiceStatusUpdate(
                    transactionId,
                    connectionId,
                    InvoiceTransactionStatus.CANCELLED
                ),
                invoiceTransactionRepository.updateInvoiceTransaction(transactionId, InvoiceTransactionStatus.CANCELLED)
            ]);
            
        } else {
            await invoiceWSService.sendInvoiceStatusUpdate(
                transactionId,
                connectionId,
                invoiceTransaction.transactionStatus
            );

            console.error(`Can't cancel an ongoing process`);
        }
    }
    catch (error) {
        console.error(`Error processing transaction ${transactionId}: ${error}`);
        console.error((<Error>error).message);

        await invoiceWSService.sendInvoiceStatusUpdate(
            transactionId,
            connectionId,
            InvoiceTransactionStatus.NOT_FOUND
        );
    }
}