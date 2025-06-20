import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';

// Guarda Parametros para não existir dependencia
import * as ssm from "aws-cdk-lib/aws-ssm";

import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class ProductsAppLayersStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const productsLayers = new lambda.LayerVersion(this, 'ProductsLayer', {
        code: lambda.Code.fromAsset('lambda/products/layers/productsLayer'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
        layerVersionName: "ProductsLayer",
        removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    new ssm.StringParameter(this, "ProductsLayerVersionArn", {
        parameterName: "ProductsLayerVersionArn",
        stringValue: productsLayers.layerVersionArn,
        description: 'ARN da versão mais recente da Products Layer',
    });

     const productEventsLayers = new lambda.LayerVersion(this, 'ProductEventsLayer', {
        code: lambda.Code.fromAsset('lambda/products/layers/productEventsLayer'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
        layerVersionName: "ProductEventsLayer",
        removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    new ssm.StringParameter(this, "ProductEventsLayerVersionArn", {
        parameterName: "ProductEventsLayerVersionArn",
        stringValue: productEventsLayers.layerVersionArn,
        description: 'ARN da versão mais recente da Products Layer',
    });
    
  }
}
