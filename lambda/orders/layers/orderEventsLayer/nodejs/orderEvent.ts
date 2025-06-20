export enum OrderEventType {
    CREATED = "ORDER_CREATED",
    DELETED = "ORDER_DELETED"
}


export interface Envelope {
    eventType: OrderEventType;
    data: string;
}

export interface OrderEvent {
    orderId: string;
    email: string;
    shipping: {
        type: string;
        carrier: string;
    },
    productCodes: string[];
    requestId: string;
    billing: order.billing
}