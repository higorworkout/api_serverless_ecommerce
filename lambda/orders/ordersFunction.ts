import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import * as AWSXRay from 'aws-xray-sdk';
import { Product, ProductRepository } from "/opt/nodejs/productsLayer";
import { DynamoDB, EventBridge, SNS } from 'aws-sdk';
import { ProductEvent, ProductEventType } from '/opt/nodejs/productEventsLayer';
import { OrderRepository, Order } from "/opt/nodejs/ordersLayer";
import { CarrierType, OrderProductResponse, OrderRequest, OrderResponse, PaymentType, ShippingType } from "/opt/nodejs/ordersApiLayer";
import { OrderEvent, OrderEventType, Envelope } from "/opt/nodejs/orderEventsLayer";

import { v4 as uuid } from "uuid";

AWSXRay.captureAWS(require("aws-sdk"));

const productsDdb = process.env.PRODUCTS_DDB!;
const ordersDbd = process.env.ORDERS_DDB!;
const orderEventsTopicArn = process.env.ORDER_EVENTS_TOPIC_ARN!;
const auditBusName = process.env.AUDIT_BUS_NAME!;


const ddbClient = new DynamoDB.DocumentClient();
const snsClient = new SNS();
const eventBridgeClient = new EventBridge()

const orderRepository = new OrderRepository(ddbClient, ordersDbd);
const productRepository = new ProductRepository(ddbClient, productsDdb);

export async function handler(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> {
    const method = event.httpMethod;
    const lambdaRequestId = context.awsRequestId;
    const apiRequestId = event.requestContext.requestId;

    console.log('Api Gateway RequestId: ' + apiRequestId + ' - Lambda RequestId: ' + lambdaRequestId)

    if (method === "GET") {

          if (event.queryStringParameters) {
            const email = event.queryStringParameters!.email;
            const orderId = event.queryStringParameters!.orderId;

            if (email) {
                if (orderId) {
                    // Get one order from an user 
                    try {
                    const order = await orderRepository.getOrder(email, orderId);

                    return {
                            statusCode: 200,
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(convertToOrderResponse(order))
                        }
                        
                    } catch (error) {
                        console.log((<Error>error).message)

                        return {
                            statusCode: 200,
                            headers: { "Content-Type": "application/json" },
                            body: (<Error>error).message
                        } 
                    }
                  
                } else {
                    // Get all orders from a user
                    const orders = await orderRepository.getOrdersByEmail(email);
                    return {
                        statusCode: 200,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(orders.map(convertToOrderResponse))
                    } 
                }
            } 
            
        } else {
            // Get all orders
            const orders = await orderRepository.getAllOrders() 
             return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(orders.map(convertToOrderResponse))
            } 

        }

    } else if (method === 'POST') {
        console.log('POSt /orders')
        const orderRequest = JSON.parse(event.body!) as OrderRequest
        const products = await productRepository.getProductsByIds(orderRequest.productIds)
      
        if (products.length === orderRequest.productIds.length) {
            const order = buildOrder(orderRequest, products)
            const orderCreatedPromise = orderRepository.createOrder(order)

            const eventResultPromise =  sendOrderEvent(order, OrderEventType.CREATED, lambdaRequestId)
            
            const [orderCreated, eventResult] = await Promise.all([orderCreatedPromise, eventResultPromise])
            console.log(
            `Order created event sent - OrderId: ${order.sk} 
            - MessageId: ${eventResult.MessageId}`
            )
            

             return {
                statusCode: 201,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(convertToOrderResponse(order))
            } 
        } else {
            console.error('Some product was not found')
            const result = await eventBridgeClient.putEvents({
                Entries: [
                    {
                        EventBusName: auditBusName,
                        Source: 'app.order',
                        DetailType: 'order',
                        Time: new Date(),
                        Detail: JSON.stringify({
                            reason: 'PRODUCT_NOT_FOUND',
                            requestId: lambdaRequestId,
                            orderRequest: orderRequest
                        })
                    }
                ]
            }).promise()
            console.log(`EventBridge putEvents result: ${JSON.stringify(result)}`)

            return {
                statusCode: 404,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: "Some product was not found"
            })
            } 
            
        }
    } else if (method === 'DELETE') {
        console.log('DELETE /orders')

        const email = event.queryStringParameters!.email!;
        const orderId = event.queryStringParameters!.orderId!;
        
        try {
            const orderDelete = await orderRepository.deleteOrder(email, orderId)


            const eventResult = await sendOrderEvent(orderDelete, OrderEventType.DELETED, lambdaRequestId)
            console.log(
                `Order deleted event sent - OrderId: ${orderDelete.sk} 
                - MessageId: ${eventResult.MessageId}`
            )
             return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(convertToOrderResponse(orderDelete))
            }
        } catch (error) {
            console.log((<Error>error).message)

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: (<Error>error).message
            } 
        } 
    }
         
    

    return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message: "Bad request"
        }) 
    }
}

function sendOrderEvent(order: Order, eventType: OrderEventType, lambdaRequestId: string) {
    const productCodes: string[] = []
    order.products?.forEach(product => {
        productCodes.push(product.code)
    })
    
    const orderEvent: OrderEvent = {
        orderId: order.sk!,
        email: order.pk,
        billing: order.billing,
        shipping: {
            type: order.shipping.type,
            carrier: order.shipping.carrier
        },
        productCodes: productCodes,
        requestId: lambdaRequestId
    }
    
    const envelope: Envelope = {
        eventType: eventType,
        data: JSON.stringify(orderEvent),
    }

    const snsParams = {
        Message: JSON.stringify(envelope),
        TopicArn: orderEventsTopicArn,
        MessageAttributes: {
            eventType: {
                DataType: "String",
                StringValue: eventType
            }
        }
    }

    return snsClient.publish(snsParams).promise()

}


function convertToOrderResponse(order: Order): OrderResponse {
    const orderProducts: OrderProductResponse[] = []
    order.products?.forEach(product  => {
        orderProducts.push({
            code: product.code,
            price: product.price,
        })
    })

    const orderResponse: OrderResponse = {
        email: order.pk,
        id: order.sk!,
        createdAt: order.createdAt!,
        products: orderProducts.length ? orderProducts : undefined ,
        billing: {
            payment: order.billing.payment as PaymentType,
            totalPrice: order.billing.totalPrice
        },
        shipping: {
            type: order.shipping.type as ShippingType,
            carrier: order.shipping.carrier as CarrierType
        }

    }

    return orderResponse
}

function buildOrder(orderRequest: OrderRequest, products: Product[]): Order {
    const orderProducts: OrderProductResponse[] = []
    let totalPrice = 0;

    products.forEach(product => {
        totalPrice += product.price
        orderProducts.push({
            code: product.code,
            price: product.price
        }) 
    })

    const order: Order = {
        pk: orderRequest.email,
        sk: uuid(),
        createdAt: Date.now(),
        billing: {
            payment: orderRequest.payment,
            totalPrice: totalPrice
        },
        shipping: {
            type: orderRequest.shipping.type,
            carrier: orderRequest.shipping.carrier
        },
        products: orderProducts
    }


    return order
}




