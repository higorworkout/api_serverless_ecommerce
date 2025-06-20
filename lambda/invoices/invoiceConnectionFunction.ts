
import * as AWSXRay from 'aws-xray-sdk-core';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

AWSXRay.captureAWS(require('aws-sdk'));


export const handler = async (
    event: APIGatewayProxyEvent, 
    context: Context
    ): Promise<APIGatewayProxyResult> => {
        console.log(event);
        console.log(context);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Function executed successfully" })
        };
    }