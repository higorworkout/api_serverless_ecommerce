import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';

// Guarda Parametros para não existir dependencia
import * as ssm from "aws-cdk-lib/aws-ssm";

import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class InvoicesAppLayerStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Invoice Transation Layer
    const invoiceTransactionLayers = new lambda.LayerVersion(this, 'InvoiceTransactionLayer', {
        code: lambda.Code.fromAsset('lambda/invoices/layers/invoiceTransaction'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
        layerVersionName: "InvoiceTransactionLayer",
        removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    new ssm.StringParameter(this, "InvoiceTransactionLayerVersionArn", {
        parameterName: "InvoiceTransactionLayerVersionArn",
        stringValue: invoiceTransactionLayers.layerVersionArn,
    });

    // Invoice Layer

      const invoiceLayers = new lambda.LayerVersion(this, 'InvoiceLayer', {
        code: lambda.Code.fromAsset('lambda/invoices/layers/invoiceRepository'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
        layerVersionName: "InvoiceRepository",
        removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    new ssm.StringParameter(this, "InvoiceRepositoryLayerVersionArn", {
        parameterName: "InvoiceRepositoryLayerVersionArn",
        stringValue: invoiceLayers.layerVersionArn,
    });


    // Invoice WebSocket API Layer
     const invoiceWSConnectionLayers = new lambda.LayerVersion(this, 'InvoiceWSConnectionLayer', {
        code: lambda.Code.fromAsset('lambda/invoices/layers/invoiceWSConnection'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
        layerVersionName: "InvoiceWSConnection",
        removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    new ssm.StringParameter(this, "InvoiceWSConnectionLayerVersionArn", {
        parameterName: "InvoiceWSConnectionLayerVersionArn",
        stringValue: invoiceWSConnectionLayers.layerVersionArn,
    });
   
    
  }
}