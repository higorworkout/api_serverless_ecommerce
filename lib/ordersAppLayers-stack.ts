import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';

// Guarda Parametros para não existir dependencia
import * as ssm from "aws-cdk-lib/aws-ssm";

import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class OrdersAppLayerStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ordersLayers = new lambda.LayerVersion(this, 'OrdersLayer', {
        code: lambda.Code.fromAsset('lambda/orders/layers/ordersLayer'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
        layerVersionName: "OrdersLayer",
        removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    new ssm.StringParameter(this, "OrdersLayerVersionArn", {
        parameterName: "OrdersLayerVersionArn",
        stringValue: ordersLayers.layerVersionArn,
        description: 'ARN da versão mais recente da order Layer',
    });

    const ordersApiLayers = new lambda.LayerVersion(this, 'OrdersApiLayer', {
        code: lambda.Code.fromAsset('lambda/orders/layers/ordersApiLayer'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
        layerVersionName: "OrdersApiLayer",
        removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    new ssm.StringParameter(this, "OrdersApiLayerVersionArn", {
        parameterName: "OrdersApiLayerVersionArn",
        stringValue: ordersApiLayers.layerVersionArn,
        description: 'ARN da versão mais recente da order Layer',
    });

     const orderEventsLayers = new lambda.LayerVersion(this, 'OrderEventsLayer', {
        code: lambda.Code.fromAsset('lambda/orders/layers/orderEventsLayer'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
        layerVersionName: "OrderEventsLayer",
        removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    new ssm.StringParameter(this, "OrderEventsLayerVersionArn", {
        parameterName: "OrderEventsLayerVersionArn",
        stringValue: orderEventsLayers.layerVersionArn,
        description: 'ARN da versão mais recente da order Layer',
    });
   
      const orderEventsRepositoryLayers = new lambda.LayerVersion(this, 'OrderEventsRepositoryLayer', {
        code: lambda.Code.fromAsset('lambda/orders/layers/orderEventsRepositoryLayer'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
        layerVersionName: "OrderEventsRepositoryLayer",
        removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    new ssm.StringParameter(this, "OrderEventsRepositoryLayerVersionArn", {
        parameterName: "OrderEventsRepositoryLayerVersionArn",
        stringValue: orderEventsRepositoryLayers.layerVersionArn,
        description: 'ARN da versão mais recente da order Layer',
    });
    
  }
}