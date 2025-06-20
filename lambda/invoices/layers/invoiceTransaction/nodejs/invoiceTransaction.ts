import { DocumentClient } from "aws-sdk/clients/dynamodb";

export enum InvoiceTransactionStatus {
    GENERATED = 'URL_GENERATED',
    RECEIVED = 'INVOICE_RECEIVED',
    PROCESSED = 'INVOICE_PROCESSED',
    TIMEOUT = 'TIMEOUT',
    CANCELLED = 'INVOICE_CANCELLED',
    NON_VALID_INVOICE_NUMBER = 'NON_VALID_INVOICE_NUMBER',
    NOT_FOUND = 'NOT_FOUND'
}

export interface InvoiceTransaction {
    pk: string;
    sk: string;
    ttl: number;
    requestId: string;
    timestamp: number;
    connectionId: string;
    expiresIn: number;
    endpoint: string;
    transactionStatus: InvoiceTransactionStatus;
}

export class InvoiceTransactionRepository {
    private ddbClient: DocumentClient;
    private invoiceTransactionDdb: string;

    constructor(ddbClient: DocumentClient, invoiceTransactionDdb: string) {
        this.ddbClient = ddbClient;
        this.invoiceTransactionDdb = invoiceTransactionDdb;
    }

    async createInvoiceTransaction(invoiceTransaction: InvoiceTransaction): Promise<InvoiceTransaction> {
        const params: DocumentClient.PutItemInput = {
            TableName: this.invoiceTransactionDdb,
            Item: invoiceTransaction,
        };

        try {
            await this.ddbClient.put(params).promise();
            return invoiceTransaction;
        } catch (error) {
            console.error("Error creating invoice transaction:", error);
            throw new Error("Could not create invoice transaction");
        }
    }

    async getInvoiceTransaction(key: string): Promise<InvoiceTransaction> {
        const params: DocumentClient.GetItemInput = {
            TableName: this.invoiceTransactionDdb,
            Key: {
                pk: `#transaction`,
                sk: key,
            },
        };

        
            const result = await this.ddbClient.get(params).promise();

            if (!result.Item) {
                console.error("Invoice transaction not found");
                throw new Error("Could not get invoice transaction");
            }

            return result.Item as InvoiceTransaction;
        
    }

    async updateInvoiceTransaction(key: string, status: InvoiceTransactionStatus): Promise<boolean> {

        try {
            const result = await this.ddbClient.update({
                TableName: this.invoiceTransactionDdb,
                Key: {
                    pk: `#transaction`,
                    sk: key,
                },
                ConditionExpression: "attribute_exists(sk)",
                UpdateExpression: "SET transactionStatus = :s",
                ExpressionAttributeValues: {
                    ":s": status,
                },
            }).promise();

            return true;
        } catch (ConditionalCheckFailedException) {
            console.error("Error updating invoice transaction:", ConditionalCheckFailedException);
            
            return false;
        }
    }
}