import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import * as AWSXRay from 'aws-xray-sdk';
import { Product, ProductRepository } from "/opt/nodejs/productsLayer";
import { DynamoDB, Lambda } from 'aws-sdk';
import { ProductEvent, ProductEventType } from '/opt/nodejs/productEventsLayer';

AWSXRay.captureAWS(require("aws-sdk"));

const productsDdb = process.env.PRODUCTS_DDB!;
const productEventsFunctionName = process.env.PRODUCT_EVENTS_FUNCTION_NAME!

const ddbClient = new DynamoDB.DocumentClient();
const productRepository = new ProductRepository(ddbClient, productsDdb);
const lambdaClient = new Lambda()

export async function handler(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> {
    const lambdaRequestId = context.awsRequestId;
    const apiRequestId = event.requestContext.requestId;

    console.log('Api Gateway RequestId: ' + apiRequestId + ' - Lambda RequestId: ' + lambdaRequestId)

    if (event.resource === "/products") {
        console.log("POST /products")
        const product = JSON.parse(event.body!) as Product;

        const productCreated = await productRepository.create(product)

        const response = await sendProductEvent(productCreated, ProductEventType.CREATED, "matilde@siecola.com.br", lambdaRequestId);

        console.log(response)

        return {
            statusCode: 201,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(productCreated) 
        }
    
    } else if (event.resource === "/products/{id}") {
        const productId = event.pathParameters!.id as string
        const method = event.httpMethod;

        if (method === 'PUT') {
            console.log("PUt /products/" + productId)
            const product = JSON.parse(event.body!) as Product;

            try {
                const productUpdated = await productRepository.updateProduct(productId, product);

                const response = await sendProductEvent(
                    productUpdated, 
                    ProductEventType.UPDATED, 
                    "doralice@siecola.com.br", 
                    lambdaRequestId);

                console.log(response)
            
            } catch (ConditionalCheckFailedException) {
                return {
                    statusCode: 404,
                    body: 'Product not found'
                }
            }


             return {
                statusCode: 200,
                body: JSON.stringify(productRepository) 
            }


        } else if (method === 'DELETE') {
            console.log("DELETE /products/" + productId)

            try {
                const product = await productRepository.deleteProduct(productId)

                const response = await sendProductEvent(
                    product, ProductEventType.DELETED, 
                    "matilde@siecola.com.br", lambdaRequestId);

                console.log(response)

                return {
                    statusCode: 200,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(product)     
                }

            } catch (err) {
                console.error((<Error>err).message)

                return {
                    statusCode: 404,
                    body: (<Error>err).message
                }
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

function sendProductEvent(
    product: Product,
    eventType: ProductEventType, 
    email: string,
    lambdaRequestId: string
) {

    const event: ProductEvent = {
        email: email,
        eventType: eventType,
        productCode: product.code,
        productId: product.id,
        productPrice: product.price,
        requestId: lambdaRequestId,
    }

  return lambdaClient.invoke({
        FunctionName: productEventsFunctionName,
        Payload: JSON.stringify(event),
        InvocationType: "Event"
    }).promise()
}
