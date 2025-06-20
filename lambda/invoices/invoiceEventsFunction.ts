import { AttributeValue, Context, DynamoDBStreamEvent } from "aws-lambda";
import { ApiGatewayManagementApi, DynamoDB, EventBridge } from "aws-sdk";
import { InvoiceWSService } from "/opt/nodejs/invoiceWSConnection";
import  * as AWSXray from 'aws-xray-sdk-core';
import { create } from "domain";
import { info } from "console";

AWSXray.captureAWS(require('aws-sdk'));
const eventsDdb = process.env.EVENTS_DDB!;
const invoiceWsApiEndpoint = process.env.INVOICE_WS_API_ENDPOINT!.substring(6);
const auditBusName = process.env.AUDIT_BUS_NAME!;

const ddbClient = new DynamoDB.DocumentClient();
const apigwManagementApi = new ApiGatewayManagementApi({
    endpoint: invoiceWsApiEndpoint,
});

const eventBridgeClient = new EventBridge()
const invoiceWSService = new InvoiceWSService(apigwManagementApi)

export async function handler(event: DynamoDBStreamEvent, context: Context): Promise<void> {
    console.log("Event: ", JSON.stringify(event, null, 2));

    const promises: Promise<any>[] = [];
    event.Records.forEach(async (record) => {
        if (record.eventName === "INSERT") {
            if (record.dynamodb!.NewImage!.pk.S!.startsWith("#transaction")) {
                console.log("Invoice transaction event received ");
            } else {
                console.log("Invoice event received ");
                promises.push(createEvent(record.dynamodb!.NewImage!, "INVOICE_CREATED"));
            }
        } else if (record.eventName === "MODIFY") {
        } else if (record.eventName === "REMOVE") {
            if (record.dynamodb!.OldImage!.pk.S === "#transaction") {
                console.log("Invoice transaction event received");
                
                const promises: Promise<any>[] = [];
                
                promises.push(processExpiredTransaction(record.dynamodb!.OldImage!, "INVOICE_CREATED"));


            }
        }
    })

    await Promise.all(promises);

    return 
}

async function createEvent(invoiceImage: {[key: string]: AttributeValue}, eventType: string) {
    const timestamp = Date.now();
    const ttl = ~~(timestamp / 1000 * 60 * 60);

    await ddbClient.put({
        TableName: eventsDdb,
        Item: {
            pk: `#invoice_${invoiceImage.sk.S}`, //#invoice_ABC123
            sk: `#${eventType}#${timestamp}`, //#event_INVOICE_CREATED
            ttl,
            email: invoiceImage.pk.S!.split('_')[1],
            createdAt: timestamp,
            eventType,
            info: {
                transaction: invoiceImage.transactionId.S,
                productId: invoiceImage.productId.N,
                quantity: invoiceImage.quantity.N,
            }
        }
    }).promise();

    return
}