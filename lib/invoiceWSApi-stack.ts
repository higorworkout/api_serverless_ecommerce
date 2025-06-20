import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as event from "aws-cdk-lib/aws-events";
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

interface InvoiceWSApiStackProps extends StackProps {
  eventsDdb: dynamodb.Table;
  auditBus: event.EventBus;
}

export class InvoiceWSApiStack extends Stack {
    constructor(scope: Construct, id: string, props?: InvoiceWSApiStackProps) {
        super(scope, id, props);

        // Invoice Transaction Layer
        const invoiceTransactionLayerArn = ssm.StringParameter
        .valueForStringParameter(this, "InvoiceTransactionLayerVersionArn");
         const invoiceTransactionLayers = lambda.LayerVersion
        .fromLayerVersionArn(this, "InvoiceTransactionLayer", invoiceTransactionLayerArn);

        // Invoice Layer

        const invoiceLayerArn = ssm.StringParameter
        .valueForStringParameter(this, "InvoiceRepositoryLayerVersionArn");
         const invoiceLayers = lambda.LayerVersion
        .fromLayerVersionArn(this, "InvoiceRepositoryLayer", invoiceLayerArn);


        // Invoice WebSocket API Layer

         const invoiceWSConnectionLayerArn = ssm.StringParameter
        .valueForStringParameter(this, "InvoiceWSConnectionLayerVersionArn");
         const invoiceWSConnectionLayers = lambda.LayerVersion
        .fromLayerVersionArn(this, "InvoiceWSConnectionLayer", invoiceWSConnectionLayerArn);
     
        
        //Invoice DynamoDB Table transaction
        const invoiceTable = new dynamodb.Table(this, 'InvoicesDdb', {
            tableName: 'invoices',
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
            partitionKey: {
                name: 'pk',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'sk',
                type: dynamodb.AttributeType.STRING,
            },
            timeToLiveAttribute: 'ttl',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
        });

        //Invoice bucket
        const bucket = new s3.Bucket(this, 'InvoiceBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    enabled: true,
                    expiration: cdk.Duration.days(1),
                },
            ],
        });

        //webSocket connection handler

    const connectionHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceConnectionFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      functionName: "InvoiceConnectionFunction",
      entry: "lambda/invoices/invoiceConnectionFunction.ts",
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
        nodeModules: [
          'aws-xray-sdk-core'
        ]
      },
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
    })

        //webSocket disconnection handler

    const disconnectionHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceDisconnectionFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      functionName: "InvoiceDisconnectionFunction",
      entry: "lambda/invoices/invoiceDisconnectionFunction.ts",
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
        nodeModules: [
          'aws-xray-sdk-core'
        ]
      },
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
    })

        //webSocket API
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'InvoiceWSApi', {
      apiName: 'InvoiceWSApi',
        connectRouteOptions: {
            integration: new apigatewayv2_integrations.WebSocketLambdaIntegration("ConnectionHandler", connectionHandler)
        },
        disconnectRouteOptions: {
            integration: new apigatewayv2_integrations.WebSocketLambdaIntegration("DisconnectionHandler", disconnectionHandler),
        },
      
    });

    const stage = "prod";
    const wsApiEndpoint = `${webSocketApi.apiEndpoint}/${stage}`;
    new apigatewayv2.WebSocketStage(this, 'InvoiceWSApiStage', {
        webSocketApi,
        stageName: stage,
        autoDeploy: true,
    })

        // Invoice URL handler
    const getUrlHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceGetUrlFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      functionName: "InvoiceGetUrlFunction",
      entry: "lambda/invoices/invoiceGetUrlFunction.ts",
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
        nodeModules: [
          'aws-xray-sdk-core'
        ]
      },
      layers: [invoiceTransactionLayers, invoiceWSConnectionLayers], 
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
      environment: {
        INVOICES_DDB: invoiceTable.tableName,
        BUCKET_NAME: bucket.bucketName,
        INVOICES_WS_API_ENDPOINT: wsApiEndpoint,
      }
    
    })

        //Grant permissions to the getUrlHandler function
    const invoicesDdbWriteTransactionsPolicy = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:PutItem'],
        resources: [invoiceTable.tableArn],
        conditions: {
            ['ForAllValues:StringEquals']: {
                'dynamodb:LeadingKeys': ['#transaction'],
            },
        },
    });

    getUrlHandler.addToRolePolicy(invoicesDdbWriteTransactionsPolicy);

    const invoicesBucketPutObjectPolicy = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject'],
        resources: [`${bucket.bucketArn}/*`],
    });

    getUrlHandler.addToRolePolicy(invoicesBucketPutObjectPolicy);
    webSocketApi.grantManageConnections(getUrlHandler);

        // Invoice import handler

     const invoiceImportHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceImportFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      functionName: "InvoiceImportFunction",
      entry: "lambda/invoices/invoiceImportFunction.ts",
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
        nodeModules: [
          'aws-xray-sdk-core'
        ]
      },
      layers: [invoiceTransactionLayers, invoiceWSConnectionLayers, invoiceLayers], 
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
      environment: {
        INVOICE_DDB: invoiceTable.tableName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
        AUDIT_BUS_NAME: props!.auditBus.eventBusName,
      }
    
    })

    props!.auditBus.grantPutEventsTo(invoiceImportHandler);
    invoiceTable.grantReadWriteData(invoiceImportHandler);
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT, new s3n.LambdaDestination(invoiceImportHandler));
    
     
    const invoicesBucketGetDeleteObjectPolicy = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:DeleteObject', 's3:GetObject'],
        resources: [`${bucket.bucketArn}/*`],
    }); 

    invoiceImportHandler.addToRolePolicy(invoicesBucketGetDeleteObjectPolicy);
    webSocketApi.grantManageConnections(invoiceImportHandler);

        //Cancel import handler
     const cancelImportHandler = new lambdaNodeJS.NodejsFunction(this, "CancelImportFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      functionName: "CancelImportFunction",
      entry: "lambda/invoices/cancelImportFunction.ts",
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
        nodeModules: [
          'aws-xray-sdk-core'
        ]
      },
      layers: [invoiceTransactionLayers, invoiceWSConnectionLayers], 
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
      environment: {
        INVOICE_DDB: invoiceTable.tableName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
      }
    
    })

     const invoicesDdbReadWriteTransactionsPolicy = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:UpdateItem', 'dynamodb:GetItem'],
        resources: [invoiceTable.tableArn],
        conditions: {
            ['ForAllValues:StringEquals']: {
                'dynamodb:LeadingKeys': ['#transaction'],
            },
        },
    });

    cancelImportHandler.addToRolePolicy(invoicesDdbReadWriteTransactionsPolicy);
    webSocketApi.grantManageConnections(cancelImportHandler);

      // webSocket API routes
    webSocketApi.addRoute('getImportUrl', {
        integration: new apigatewayv2_integrations.WebSocketLambdaIntegration("GetUrlHandler", getUrlHandler),
      });

    webSocketApi.addRoute('cancelImport', {
        integration: new apigatewayv2_integrations
        .WebSocketLambdaIntegration("CancelImportHandler", cancelImportHandler),
      });

    const invoiceEventsHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceEventsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      functionName: "InvoiceEventsFunction",
      entry: "lambda/invoices/invoiceEventsFunction.ts",
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
        nodeModules: [
          'aws-xray-sdk-core'
        ]
      },
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        EVENTS_DDB: props!.eventsDdb.tableName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
        AUDIT_BUS_NAME: props!.auditBus.eventBusName,
      },
      layers: [invoiceWSConnectionLayers],
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
    })
      webSocketApi.grantManageConnections(invoiceEventsHandler);

      
      props!.auditBus.grantPutEventsTo(invoiceEventsHandler);
      const eventsDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:PutItem"],
      resources: [props!.eventsDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          "dynamodb:LeadingKeys": [
            "#invoice_*"
          ]
        }
      }
      }); 

      invoiceEventsHandler.addToRolePolicy(eventsDdbPolicy);

      const invoiceEventsDlq = new sqs.Queue(this, "InvoiceEventsDlq", {
          queueName: "invoice-events-dlq"
      })
      invoiceEventsHandler.addEventSource(new lambdaEventSources.DynamoEventSource(invoiceTable, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        bisectBatchOnError: true,
        retryAttempts: 3,
        onFailure: new lambdaEventSources.SqsDlq(invoiceEventsDlq),
      }))
    }
}