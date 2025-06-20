import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as event from "aws-cdk-lib/aws-events";
import * as lambdaEventSource from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";



import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

interface OrdersAppStackProps extends cdk.StackProps {
    productsDdb: dynamodb.Table,
    eventsDdb: dynamodb.Table,
    auditBus: event.EventBus
}

export class OrdersAppStack extends cdk.Stack {
  readonly ordersHandler: lambdaNodeJS.NodejsFunction;
  readonly orderEventsFetchHandler: lambdaNodeJS.NodejsFunction;

  constructor(scope: Construct, id: string, props: OrdersAppStackProps) {
    super(scope, id, props);

    const ordersDbd = new dynamodb.Table(this, "OrdersDbd", {
      tableName: "orders", 
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });


    //Orders Layer
    const ordersLayerArn = ssm.StringParameter
      .valueForStringParameter(this, "OrdersLayerVersionArn");
    const ordersLayer = lambda.LayerVersion
      .fromLayerVersionArn(this, "OrdersLayerVersionArn", ordersLayerArn);

    // Product Layer
    const productsLayerArn = ssm.StringParameter
      .valueForStringParameter(this, "ProductsLayerVersionArn");
    const productsLayer = lambda.LayerVersion
      .fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn);

    //Orders API Layer
    const ordersApiLayerArn = ssm.StringParameter
      .valueForStringParameter(this, "OrdersApiLayerVersionArn");
    const ordersApiLayer = lambda.LayerVersion
      .fromLayerVersionArn(this, "OrdersApiLayerVersionArn", ordersApiLayerArn);

    //Order Events Layer
    const orderEventsLayerArn = ssm.StringParameter
      .valueForStringParameter(this, "OrderEventsLayerVersionArn");
    const orderEventsLayer = lambda.LayerVersion
      .fromLayerVersionArn(this, "OrderEventsLayerVersionArn", orderEventsLayerArn);

    //Order Events Repository Layer
    const orderEventsRepositoryLayerArn = ssm.StringParameter
      .valueForStringParameter(this, "OrderEventsRepositoryLayerVersionArn");
    const orderEventsRepositoryLayer = lambda.LayerVersion
      .fromLayerVersionArn(this, "OrderEventsRepositoryLayerVersionArn", orderEventsRepositoryLayerArn);

    const ordersTopic = new sns.Topic(this, "OrderEventsTopic", {
      displayName: "Order events topic",
      topicName: "orders-events"
    });

    this.ordersHandler = new lambdaNodeJS.NodejsFunction(this, "OrdersFunction", {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: "OrdersFunction",
        entry: "lambda/orders/ordersFunction.ts",
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
        environment: {
          PRODUCTS_DDB: props.productsDdb.tableName,
          ORDERS_DDB: ordersDbd.tableName,
          ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn,
          AUDIT_BUS_NAME: props.auditBus.eventBusName,
        },
        layers: [productsLayer, ordersLayer, ordersApiLayer, orderEventsLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
    })


    ordersDbd.grantReadWriteData(this.ordersHandler);
    props.productsDdb.grantReadData(this.ordersHandler);
    ordersTopic.grantPublish(this.ordersHandler);
    props.auditBus.grantPutEventsTo(this.ordersHandler);

    //Metrics for Orders Handler
    const productNotFoundMetricFilter = this.ordersHandler.logGroup
    .addMetricFilter("ProductNotFoundMetric", {
      filterPattern: logs.FilterPattern.literal("Some product was not found"),
      metricName: "OrderWithNonValidProduct",
      metricNamespace: "ProductNotFound",
    });

    // Alarm
    const productNotFoundAlarm = productNotFoundMetricFilter
    .metric()
    .with({
      statistic: "Sum",
      period: cdk.Duration.minutes(2)
    })
    .createAlarm(this, "ProductNotFoundAlarm", {
      alarmName: "ProductNotFoundAlarm",
      alarmDescription: "Alarm when an order is created with a non found product",
      threshold: 2,
      evaluationPeriods: 1,
      actionsEnabled: true,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    // Action
    const orderAlarmsTopic = new sns.Topic(this, "OrderAlarmsTopic", {
      displayName: "Order Alarms Topic",
      topicName: "order-alarms"
    });

    orderAlarmsTopic.addSubscription(new subs.EmailSubscription("higor.15nwa@gmail.com"));
    productNotFoundAlarm.addAlarmAction(new cw_actions.SnsAction(orderAlarmsTopic));

    const orderEventsHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEventsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      functionName: "OrderEventsFunction",
      entry: "lambda/orders/orderEventsFunction.ts",
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
      environment: {
        EVENTS_DDB: props.eventsDdb.tableName
      },
      layers: [orderEventsLayer, orderEventsRepositoryLayer],
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
    })

    ordersTopic.addSubscription(new subs.LambdaSubscription(orderEventsHandler));
    
    const eventsDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:PutItem"],
      resources: [props.eventsDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          "dynamodb:LeadingKeys": [
            "#order_*"
          ]
        }
      }
    }); 

    orderEventsHandler.addToRolePolicy(eventsDdbPolicy);

    const billingHandler = new lambdaNodeJS.NodejsFunction(this, "BillingFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      functionName: "BillingFunction",
      entry: "lambda/orders/billingFunction.ts",
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

    ordersTopic.addSubscription(new subs.LambdaSubscription(billingHandler, {
      filterPolicy: {
        eventType: sns.SubscriptionFilter.stringFilter({
          allowlist: ["ORDER_CREATED"]
        })
      }
    }));

    const orderEventsDlq = new sqs.Queue(this, "OrderEventsDlq", {
      queueName: "order-events-dlq",
      retentionPeriod: cdk.Duration.days(10),
      encryption: sqs.QueueEncryption.UNENCRYPTED,
      enforceSSL: false
    })

    const orderEventsQueue = new sqs.Queue(this, "OrderEventsQueue", {
         queueName: "order-events",
         deadLetterQueue: {
           queue: orderEventsDlq,
           maxReceiveCount: 3
         },
         enforceSSL: false,
         encryption: sqs.QueueEncryption.UNENCRYPTED,
    })

    ordersTopic.addSubscription(new subs.SqsSubscription(orderEventsQueue, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ["ORDER_CREATED"]
          })
        }
    }));

      const orderEmailsHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEmailsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      functionName: "OrderEmailsFunction",
      entry: "lambda/orders/orderEmailsFunction.ts",
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
      layers: [orderEventsLayer],
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
    })

    orderEmailsHandler.addEventSource(new lambdaEventSource.SqsEventSource(orderEventsQueue /*, {
      batchSize: 5,
      enabled: true,
      maxBatchingWindow: cdk.Duration.minutes(1)  
    }*/));

    orderEventsQueue.grantConsumeMessages(orderEmailsHandler);
    const orderEmailSesPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"]
    });

    orderEmailsHandler.addToRolePolicy(orderEmailSesPolicy);

    this.orderEventsFetchHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEventsFetchFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      functionName: "OrderEventsFetchFunction",
      entry: "lambda/orders/orderEventsFetchFunction.ts",
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
      environment: {
        EVENTS_DDB: props.eventsDdb.tableName
      },
      layers: [orderEventsRepositoryLayer],
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
    })
    
    const eventsFetchDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:Query"],
      resources: [`${props.eventsDdb.tableArn}/index/emailIndex`]
    });

    this.orderEventsFetchHandler.addToRolePolicy(eventsFetchDdbPolicy);
    
  }  
}
