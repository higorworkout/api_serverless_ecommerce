import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { ProductRepository } from "/opt/nodejs/productsLayer";
import { DynamoDB } from 'aws-sdk';

import * as AWSXRay from 'aws-xray-sdk';

AWSXRay.captureAWS(require("aws-sdk"));


const productsDdb = process.env.PRODUCTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();
const productRepository = new ProductRepository(ddbClient, productsDdb);

export async function handler(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> {
    const lambdaRequestId = context.awsRequestId;
    const apiRequestId = event.requestContext.requestId;

    console.log('Api Gateway RequestId: ' + apiRequestId + ' - Lambda RequestId: ' + lambdaRequestId)
    const method = event.httpMethod;
    if (event.resource === "/products") {
        if (method === 'GET') {
            console.log('GET /products')

            const products = await productRepository.getAllProducts();

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(products) 
            }
        } 
    } else if (event.resource === "/products/{id}") {
        const productId = event.pathParameters!.id as string

        console.log("GEt /products/" + productId)
        try {
            const product = await productRepository.getProductById(productId);

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(product) 
            }
        } catch(err) {
            console.error((<Error>err).message)

            return {
                statusCode: 404,
                body: (<Error>err).message
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
