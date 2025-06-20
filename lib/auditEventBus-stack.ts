import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as cw from "aws-cdk-lib/aws-cloudwatch";


import { Construct } from 'constructs';



export class AuditEventBusStack extends cdk.Stack {
  readonly bus: events.EventBus; 

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an Event Bus
    this.bus = new events.EventBus(this, 'AuditEventBus', {
      eventBusName: 'AuditEventBus',
    });

    this.bus.archive('BusArchive', {
        eventPattern: {
          source: ['app.order'],
        },
        archiveName: 'AuditEvent',
        retention: cdk.Duration.days(10),
    });

    //source: app.order
    //detail-type: order
    //reason: PRODUCT_NOT_FOUND
    const nonValidOrderRule = new events.Rule(this, 'NonValidOrderRule', {
        ruleName: 'NonValidOrderRule',
        description: 'Rule to capture non-valid orders',
        eventBus: this.bus,
        eventPattern: {
          source: ['app.order'],
          detailType: ['order'],
          detail: {
            reason: ['PRODUCT_NOT_FOUND'],
            },
        },
    });
    // target
      const orderErrorsFunction = new lambdaNodeJS.NodejsFunction(this, "OrdersErrorsFunction", {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: "OrdersErrorsFunction",
        entry: "lambda/audit/ordersErrorsFunction.ts",
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

    nonValidOrderRule.addTarget(new targets.LambdaFunction(orderErrorsFunction));

    //source: app.invoice
    //detail-type: invoice
    //reason: FAIL_NO_INVOICE_NUMBER
    const nonValidInvoiceRule = new events.Rule(this, 'NonValidInvoiceRule', {
        ruleName: 'NonValidInvoiceRule',
        description: 'Rule to capture non-valid invoice',
        eventBus: this.bus,
        eventPattern: {
          source: ['app.invoice'],
          detailType: ['invoice'],
          detail: {
            errorDetail: ['FAIL_NO_INVOICE_NUMBER'],
          },
        },
    });

    // target
      const invoicesErrorsFunction = new lambdaNodeJS.NodejsFunction(this, "InvoicesErrorsFunction", {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: "InvoicesErrorsFunction",
        entry: "lambda/audit/invoicesErrorsFunction.ts",
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

    nonValidInvoiceRule.addTarget(new targets.LambdaFunction(invoicesErrorsFunction));

     //source: app.invoice
    //detail-type: invoice
    //errorDetail: TIMEOUT
    const timeoutImportInvoiceRule = new events.Rule(this, 'TimeoutImportInvoiceRule', {
        ruleName: 'TimeoutImportInvoiceRule',
        description: 'Rule to capture timeout import invoice',
        eventBus: this.bus,
        eventPattern: {
          source: ['app.invoice'],
          detailType: ['invoice'],
          detail: {
            errorDetail: ['TIMEOUT'],
          },
        },
    });

    // target
    const invoiceImportTimeoutQueue = new sqs.Queue(this, 'InvoiceImportTimeoutQueue', {
      queueName: 'Invoice-import-timeout',
    });

    timeoutImportInvoiceRule.addTarget(new targets.SqsQueue(invoiceImportTimeoutQueue));

    //Metric
    const numberOfMessagesMetric = 
    invoiceImportTimeoutQueue.metricApproximateNumberOfMessagesVisible({
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
      label: 'Number of messages in the queue',
    });

    // Alarm
    numberOfMessagesMetric.createAlarm(this, 'InvoiceImportTimeoutAlarm', {
      alarmName: 'InvoiceImportTimeout',
      actionsEnabled: false,
      evaluationPeriods: 1,
      threshold: 5,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Alarm when the number of messages in the Invoice Import Timeout queue is greater than or equal to 5.',
    })
  }
}