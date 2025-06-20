
import * as AWSXRay from 'aws-xray-sdk-core';
import { Context, S3Event, S3EventRecord } from 'aws-lambda';
import { ApiGatewayManagementApi, DynamoDB, EventBridge, S3 } from 'aws-sdk';
import { InvoiceTransactionRepository, InvoiceTransactionStatus } from '/opt/nodejs/invoiceTransaction';
import { InvoiceWSService } from '/opt/nodejs/invoiceWSConnection';
import { InvoiceFile, InvoiceRepository } from '/opt/nodejs/invoiceRepository';

AWSXRay.captureAWS(require('aws-sdk'));

const invoicesDdb = process.env.INVOICES_DDB!;
const invoicesWsApiEndpoint = process.env.INVOICES_WS_API_ENDPOINT!.substring(6);
const auditBusName = process.env.AUDIT_BUS_NAME!;

const s3Client = new S3();
const ddbClient = new DynamoDB.DocumentClient();
const apigwManagamentApi  = new ApiGatewayManagementApi({
    endpoint: invoicesWsApiEndpoint,
});
const eventBridgeClient = new EventBridge()

const invoiceTransactionRepository = new InvoiceTransactionRepository(ddbClient, invoicesDdb);
const invoiceWSService = new InvoiceWSService(apigwManagamentApi);
const invoiceRepository = new InvoiceRepository(ddbClient, invoicesDdb);


export const handler = async (
    event: S3Event, 
    context: Context
    ): Promise<void> => {
        const promises: Promise<any>[] = [];
        // to be removed
        console.log(event);

        event.Records.forEach(async (record) => {
            promises.push(
                processRecord(record)
            );
        });
        await Promise.all(promises);
        
        return;
    }

async function processRecord(record: S3EventRecord) {
    const key = record.s3.object.key;

    try {
        const invoiceTransaction = await invoiceTransactionRepository.getInvoiceTransaction(key);

        if (invoiceTransaction.transactionStatus === InvoiceTransactionStatus.GENERATED) {
           
            await Promise.all([invoiceWSService.sendInvoiceStatusUpdate(
                key,
                invoiceTransaction.connectionId,
                InvoiceTransactionStatus.RECEIVED
            ), invoiceTransactionRepository.updateInvoiceTransaction(key, InvoiceTransactionStatus.RECEIVED)]);
            
        } else {
            await invoiceWSService.sendInvoiceStatusUpdate(
                key, 
                invoiceTransaction!.connectionId,
                invoiceTransaction!.transactionStatus);
            console.error('Non valid transaction status');
            return;
        }

        const object = await s3Client.getObject({
            Bucket: record.s3.bucket.name,
            Key: key,
        }).promise()

        const  invoice = JSON.parse(object.Body!.toString('utf-8')) as InvoiceFile;
        console.log(invoice);

        const createInvoivePromise = invoiceRepository.create({
            pk: `#invoice_${invoice.customerName}`,
            sk: invoice.invoiceNumber,
            ttl: 0,
            totalValue: invoice.totalValue,
            productId: invoice.productId,
            transactionId: key,
            createdAt: Date.now(),
        })

        const deleteObjectPromise = s3Client.deleteObject({
            Bucket: record.s3.bucket.name,
            Key: key,
        }).promise()

        const updateInvoicePromise = invoiceTransactionRepository.updateInvoiceTransaction(key, InvoiceTransactionStatus.PROCESSED);
        const sendStatusPromise = invoiceWSService.sendInvoiceStatusUpdate(
            key,
            invoiceTransaction.connectionId,
            InvoiceTransactionStatus.PROCESSED
        );
        
        await Promise.all([createInvoivePromise, deleteObjectPromise, updateInvoicePromise, sendStatusPromise]);
        console.log('Invoice processed successfully');

    } catch (error) {
        console.log((<Error>error).message);
    }
   
}