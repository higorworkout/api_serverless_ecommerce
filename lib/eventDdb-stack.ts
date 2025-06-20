import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EventsDdbStack extends cdk.Stack {
  readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, "EventsDbd", {
      tableName: "events", 
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING
      },
      timeToLiveAttribute: "ttl", // permitindo que os itens sejam automaticamente excluídos após um determinado tempo.
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      
    });

    this.table.addGlobalSecondaryIndex({
      indexName: "emailIndex",
      partitionKey: {
        name: "email",
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });
    
/*
    const readScale = this.table.autoScaleReadCapacity({
      minCapacity: 1,
      maxCapacity: 2
    });

    readScale.scaleOnUtilization({
      targetUtilizationPercent: 50, 
      scaleInCooldown: cdk.Duration.seconds(60), 
      scaleOutCooldown: cdk.Duration.seconds(60)
    });

    const writeScale = this.table.autoScaleWriteCapacity({
      minCapacity: 1,
      maxCapacity: 4
    });

    writeScale.scaleOnUtilization({
      targetUtilizationPercent: 30, 
      scaleInCooldown: cdk.Duration.seconds(60), 
      scaleOutCooldown: cdk.Duration.seconds(60)
    });
    */
  }
}
