import { DocumentClient } from "aws-sdk/clients/dynamodb";

export interface OrderProduct {
   code: string,
   price: number, 
}

export interface Order {
    pk: string,
    sk: string,
    createdAt: number,
    shipping: {
        type: "URGENT" | "ECONOMIC",
        carrier: "CORREIOS" | "FEDEX",
    },
    billing: {
        payment: "CASH" | "DEBIT_CARD" | "CREDIT_CARD",
        totalPrice: number
    },
    products?: OrderProduct[]
}

export class OrderRepository {
   private ddbClient: DocumentClient;
   private ordersDbd: string; 

   constructor(ddbClient: DocumentClient, ordersDdb: string) {
        this.ddbClient = ddbClient;
        this.ordersDbd = ordersDdb;
    }

    async createOrder(order: Order): Promise<Order> {

        await this.ddbClient.put({
            TableName: this.ordersDbd,
            Item: order
        }).promise()

        return order
    }

      async getAllOrders(): Promise<Order[]> {
        const data = await this.ddbClient.scan({
            TableName: this.ordersDbd,
            ProjectionExpression: "pk, sk, createdAt, shipping, billing"
        }).promise() 

        return data.Items as Order[]
    }

    async getOrdersByEmail(email: string): Promise<Order[]> {
        const data = await this.ddbClient.query({
            TableName: this.ordersDbd,
            ProjectionExpression: "pk, sk, createdAt, shipping, billing",
            KeyConditionExpression: "pk = :email",
            ExpressionAttributeValues: {
                ":email": email
            }
        }).promise() 

        return data.Items as Order[]
     }

      async getOrder(email: string, orderId: string): Promise<Order> {
        const data = await this.ddbClient.get({
            TableName: this.ordersDbd,
            Key: {
                pk: email,
                sk: orderId,
            },
            ProjectionExpression: "pk, sk, createdAt, shipping, billing"
        }).promise() 

        if (data.Item) {
            return data.Item as Order
            
        } else {
            throw new Error('Order not found');          
        }
     }
    

    async deleteOrder(email: string, orderId: string): Promise<Order> {
        const data = await this.ddbClient.delete({
            TableName: this.ordersDbd,
            Key: {
                pk: email,
                sk: orderId,
            },
            ReturnValues: "ALL_OLD"
        }).promise() 

        if(data.Attributes) {
            return data.Attributes as Order
        } else {
            throw new Error('Order not found');          
        }
     }
}