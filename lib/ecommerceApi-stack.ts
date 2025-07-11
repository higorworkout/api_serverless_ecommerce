
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cwlogs from 'aws-cdk-lib/aws-logs';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';

import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

interface ECommerceApiStackProps extends cdk.StackProps {
    productsFetchHandler: lambdaNodeJS.NodejsFunction;
    productsAdminHandler: lambdaNodeJS.NodejsFunction;
    ordersHandler: lambdaNodeJS.NodejsFunction;
    orderEventsFetchHandler: lambdaNodeJS.NodejsFunction;
}

export class ECommerceApiStack extends cdk.Stack {
  private productsAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
  private productsAdminAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
  private customerPool: cognito.UserPool;
  private adminPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: ECommerceApiStackProps) {
    super(scope, id, props);

    const logGroup = new cwlogs.LogGroup(this, "ECommerceApiLogs")

    const api = new apigateway.RestApi(this, "ECommerceApi", {
        restApiName: "ECommerceApi",
        cloudWatchRole: true,
        deployOptions: {
          accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
          accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
              httpMethod: true,
              ip: true,
              protocol: true,
              requestTime: true,
              responseLength: true,
              status: true,
              caller: true,
              user: true,
              resourcePath: true
          })
        }
    })

    this.createCognitoAuth();
    this.createProductsService(props, api);
    this.createOrdersService(props, api);
  
  
  }

  private createCognitoAuth() {
      const postConfirmationHandler = new lambdaNodeJS.NodejsFunction(this, "PostConfirmationHandler", {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: "PostConfirmationFunction", 
        entry: "lambda/auth/postConfirmationFunction.ts",
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

        const preAuthenticationHandler = new lambdaNodeJS.NodejsFunction(this, "PreAuthenticationFunction", {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: "PreAuthenticationFunction", 
        entry: "lambda/auth/preAuthenticationFunction.ts",
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

    // Cognito User Pool
    this.customerPool = new cognito.UserPool(this, "CustomerPool", {
      lambdaTriggers: {
        postConfirmation: postConfirmationHandler,
        preAuthentication: preAuthenticationHandler
      },
      userPoolName: "CustomerPool",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      selfSignUpEnabled: true,
      autoVerify: {
        email: true,
        phone: false
      },
      userVerification: {
        emailSubject: "Verify your email for the ECommerce API!",
        emailBody: "Hello {username}, Thanks for signing up to ECommerce service! Your verification code is {####}",
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      signInAliases: {
        email: true,
        username: false
      },
      standardAttributes: {
        fullname: {
          required: true,
          mutable: false
        }
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(3)
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    // cognito User Pool Admin

    this.adminPool = new cognito.UserPool(this, "AdminPool", {
      userPoolName: "AdminPool",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      selfSignUpEnabled: false,
      userInvitation: {
        emailSubject: "Welcome to ECommerce adminitrator service",
        emailBody: 'Your username is {username} and your password is {####}'
      },
      signInAliases: {
        email: true,
        username: false
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: false
        }
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(3)
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    this.customerPool.addDomain("AdminDomain", {
      cognitoDomain: {
        domainPrefix: "hrs-administrator-service"
      }
    });

    this.customerPool.addDomain("CustomerDomain", {
      cognitoDomain: {
        domainPrefix: "hrs-customer-service"
      }
    });

    const customerWebScope = new cognito.ResourceServerScope({
      scopeName: "web",
      scopeDescription: "Customer web scope"
    });

    const customerMobileScope = new cognito.ResourceServerScope({
      scopeName: "mobile",
      scopeDescription: "Customer Mobile operation"
    });

    const adminWebScope = new cognito.ResourceServerScope({
      scopeName: "web",
      scopeDescription: "Admin Web operation"
    });

    const customerResourceServer = this.customerPool.addResourceServer("CustomerResourceServer", {
      identifier: "customer",
      userPoolResourceServerName: "CustomerResourceServer",
      scopes: [customerWebScope, customerMobileScope]
      }); 

       const adminResourceServer = this.adminPool.addResourceServer("AdminResourceServer", {
      identifier: "admin",
      userPoolResourceServerName: "AdminResourceServer",
      scopes: [adminWebScope]
      }); 

      this.customerPool.addClient("customer-web-client", {
        userPoolClientName: "customerWebClient",
        authFlows: {
          userPassword: true,
        },
        accessTokenValidity: cdk.Duration.minutes(60),
        refreshTokenValidity: cdk.Duration.days(7),
        oAuth: {
          scopes: [cognito.OAuthScope.resourceServer(customerResourceServer, customerWebScope)],
        }
      });


      this.customerPool.addClient("customer-mobile-client", {
        userPoolClientName: "customerMobileClient",
        authFlows: {
          userPassword: true,
        },
        accessTokenValidity: cdk.Duration.minutes(60),
        refreshTokenValidity: cdk.Duration.days(7),
        oAuth: {
          scopes: [cognito.OAuthScope.resourceServer(customerResourceServer, customerMobileScope)],
        }
      });

       this.adminPool.addClient("admin-web-client", {
        userPoolClientName: "adminWebClient",
        authFlows: {
          userPassword: true,
        },
        accessTokenValidity: cdk.Duration.minutes(60),
        refreshTokenValidity: cdk.Duration.days(7),
        oAuth: {
          scopes: [cognito.OAuthScope.resourceServer(adminResourceServer, adminWebScope)],
        }
      });

      this.productsAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, "ProductsAuthorizer", {
        authorizerName: "ProductsAuthorizer",
        cognitoUserPools: [this.customerPool, this.adminPool],  
      }); 

       this.productsAdminAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, "ProductsAdminAuthorizer", {
        authorizerName: "ProductsAdminAuthorizer",
        cognitoUserPools: [this.adminPool],  
      }); 
  }


   private createOrdersService(props: ECommerceApiStackProps, api: apigateway.RestApi) {
    const ordersIntegration = new apigateway.LambdaIntegration(props.ordersHandler);

    // resource "/orders"
    const ordersResource = api.root.addResource('orders');

    // "/orders"

    // GEt /orders?email=higor@gmail.com
    
    // GEt /orders?email=higor@gmail.com&orderId=123
    
    ordersResource.addMethod('GET', ordersIntegration);



    const orderDeletionValidator = new apigateway
    .RequestValidator(this, "OrderDeletionValidator", {
      restApi: api,
      requestValidatorName: "OrderDeletionValidator",
      validateRequestParameters: true,
    });

    // DELEtE /orders?email=higor@gmail.com&orderId=123
    ordersResource.addMethod('DELETE', ordersIntegration, {
      requestParameters: {
        'method.request.querystring.email': true,
        'method.request.querystring.orderId': true,
      }, 
      requestValidator: orderDeletionValidator
    });

    const orderRequestValidator = new apigateway.RequestValidator(this, "OrderRequestValidator", {
      restApi: api,
      requestValidatorName: "Order request validator",
      validateRequestBody: true
    });

    const orderModel = new apigateway.Model(this, "OrderModel", {
      modelName: "OrderModel",
      restApi: api,
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          email: {
            type: apigateway.JsonSchemaType.STRING
          },
          productIds: { 
            type: apigateway.JsonSchemaType.ARRAY,
            minItems: 1,
            items: {
              type: apigateway.JsonSchemaType.STRING
            }
          },
          payment: {
            type: apigateway.JsonSchemaType.STRING,
            enum: ["CASH", "DEBIT_CARD", "CREDIT_CARD"]
          }
        },
        required: [
          "email",
          "productIds",
          "payment"
        ]
      }
    });

    // POSt /orders
    ordersResource.addMethod('POST', ordersIntegration, {
      requestValidator: orderRequestValidator,
      requestModels: {
        "application/json": orderModel
      }
    });

    // /orders/events
    const orderEventsResource = ordersResource.addResource('events');

    const orderEventsFetchValidator = new apigateway.RequestValidator(this, "OrderEventsFetchValidator", {
      restApi: api,
      requestValidatorName: "OrderEventsFetchValidator",
      validateRequestParameters: true,
    });

    const orderEventsFunctionIntegration = new apigateway.LambdaIntegration(props.orderEventsFetchHandler);
    

    // GEt /orders/events?email=higor@gmail.com
    // GET /orders/events?email=higor@gmail.com&eventType=ORDER_CREATED 
    orderEventsResource.addMethod('GET', orderEventsFunctionIntegration, {
      requestParameters: {
        'method.request.querystring.email': true,
        'method.request.querystring.eventType': false
      },
      requestValidator: orderEventsFetchValidator
    });

  }

  private createProductsService(props: ECommerceApiStackProps, api: apigateway.RestApi) {
    const productsFetchIntegration = new apigateway.LambdaIntegration(props.productsFetchHandler);

    const productsFetchWebMobileIntegrationOption = {
      authorizer: this.productsAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizationScopes: ['customer/web', 'customer/mobile', 'admin/web'],
    }

     const productsFetchWebIntegrationOption = {
      authorizer: this.productsAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizationScopes: ['customer/web', 'admin/web'],
    }
    // "/products"
    const productsResource = api.root.addResource('products'); 
    productsResource.addMethod('GET', productsFetchIntegration, productsFetchWebMobileIntegrationOption);

    // GEt /products/{id}
    const productIdResource = productsResource.addResource('{id}');
    productIdResource.addMethod('GET', productsFetchIntegration, productsFetchWebIntegrationOption);

    const productRequestValidator = new apigateway.RequestValidator(this, "productRequestValidator", {
      restApi: api,
      requestValidatorName: "product request validator",
      validateRequestBody: true
    });

    const productModel = new apigateway.Model(this, "productModel", {
      modelName: "productModel",
      restApi: api,
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          productName: {
            type: apigateway.JsonSchemaType.STRING
          },
          code: { 
            type: apigateway.JsonSchemaType.ARRAY,
            minItems: 3,
          },
          model: {
            type: apigateway.JsonSchemaType.STRING,
          },
          productUrl: {
            type: apigateway.JsonSchemaType.STRING,
          },
          price: {
            type: apigateway.JsonSchemaType.NUMBER
          }
        },
        required: [
          "productName",
          "code"
        ]
      }
    });

    const productsAdminIntegration = new apigateway.LambdaIntegration(props.productsAdminHandler);

    // POST /products
    productsResource.addMethod('POST', productsAdminIntegration, {
      requestValidator: productRequestValidator,
      requestModels: {
        "application/json": productModel
      },
      authorizer: this.productsAdminAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizationScopes: ['admin/web']
    });
    // PUt /products/{id}
    productIdResource.addMethod('PUT', productsAdminIntegration);
    // DELEtE //products/{id}
    productIdResource.addMethod('DELETE', productsAdminIntegration);
  
  }
}