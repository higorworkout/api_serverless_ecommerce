import { ApiGatewayManagementApi } from "aws-sdk";

export class InvoiceWSService {
    private apigwManagementApi: ApiGatewayManagementApi;

    constructor(apigwManagementApi: ApiGatewayManagementApi) {
        this.apigwManagementApi = apigwManagementApi;
    }

    sendInvoiceStatusUpdate(transactionId: string, connectionId: string, status: string): Promise<boolean> {
        const postData = JSON.stringify({
            transactionId,
            status,
        });
        return this.sendData(connectionId, postData);
    }

    async disconnectClient(connectionId: string): Promise<boolean> {
        try {
            await this.apigwManagementApi.getConnection({
                ConnectionId: connectionId,
            }).promise();

            await this.apigwManagementApi.deleteConnection({
                ConnectionId: connectionId,
            }).promise();
            
            return true;
        } catch (error) {
            console.error("Error disconnecting client:", error);
            return false;
        }
    }

    async sendData(connectionId: string, data: string): Promise<boolean> {
        try {
            await this.apigwManagementApi.getConnection({
                ConnectionId: connectionId,
            }).promise();
            
            await this.apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: data,
            }).promise();
            return true;
        } catch (error) {
            console.error("Error sending data to client:", error);
            return false;
        }
    }
}