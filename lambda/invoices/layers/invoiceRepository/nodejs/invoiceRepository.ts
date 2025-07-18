import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { DynamoDB } from "aws-sdk";

export interface Invoice {
    pk: string;
    sk: string;
    totalValue: number;
    productId: string;
    transactionId: string;
    ttl: number;
    createdAt: number;
}

export interface InvoiceFile {
    customerName: string;
    invoiceNumber: string;
    totalValue: number;
    productId: string;
    quantity: number;
}

export class InvoiceRepository {
    private ddbClient: DocumentClient;
    private invoicesDdb: string;

    constructor(ddbClient: DocumentClient, invoicesDdb: string) {
        this.ddbClient = ddbClient;
        this.invoicesDdb = invoicesDdb;
        
    }

    async create(invoice: Invoice): Promise<Invoice> {
        await this.ddbClient.put({
            TableName: this.invoicesDdb,
            Item: invoice,
        }).promise();

        return invoice;
    }

}