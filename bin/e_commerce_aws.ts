#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductAppStack } from '../lib/productsApp-stack';
import { ECommerceApiStack } from '../lib/ecommerceApi-stack';
import { ProductsAppLayersStack } from '../lib/productsAppLayers-stack';
import { EventsDdbStack } from '../lib/eventDdb-stack';
import { OrdersAppLayerStack } from '../lib/ordersAppLayers-stack';
import { OrdersAppStack } from '../lib/ordersApp-stack';
import { InvoiceWSApiStack } from '../lib/invoiceWSApi-stack';
import { InvoicesAppLayerStack } from '../lib/invoicesAppLayers-stack';
import { AuditEventBusStack } from '../lib/auditEventBus-stack';

const app = new cdk.App();

const env: cdk.Environment = {
    account: "537124975999",
    region: "us-east-1"
} 

const tags = {
    cost: "ECommerce",
    team: "HigorCode"
}

const auditEventBus = new AuditEventBusStack(app, "AuditEvents", {
  tags: {
    cost: 'Audit',
    team: 'SiecolaCode'
  },
  env: env
})


const productAppLayerStack = new ProductsAppLayersStack(app, "ProductsAppLayer", {
    tags: tags,
    env: env
});

const eventsDdbStack = new EventsDdbStack(app, "EventsDdb", {
    tags: tags,
    env: env
});

const productsAppStack = new ProductAppStack(app, "ProductsApp", {
    tags: tags,
    env: env,
    eventsDdb: eventsDdbStack.table
});

productsAppStack.addDependency(productAppLayerStack);
productsAppStack.addDependency(eventsDdbStack);

const ordersAppLayerStack = new OrdersAppLayerStack(app, "OrdersAppLayers", {
    tags: tags,
    env: env
});

const ordersAppStack = new OrdersAppStack(app, "OrdersApp", {
    tags: tags,
    env: env,
    productsDdb: productsAppStack.productsDbd,
    eventsDdb: eventsDdbStack.table,
    auditBus: auditEventBus.bus
});

ordersAppStack.addDependency(productsAppStack);
ordersAppStack.addDependency(ordersAppLayerStack);
ordersAppStack.addDependency(eventsDdbStack);
ordersAppStack.addDependency(auditEventBus);

const eCommerceApiStack = new ECommerceApiStack(app, "ECommerceApi", {
    productsFetchHandler: productsAppStack.productsFetchHandler,
    productsAdminHandler: productsAppStack.productsAdminHandler,
    ordersHandler: ordersAppStack.ordersHandler,
    orderEventsFetchHandler: ordersAppStack.orderEventsFetchHandler,
    tags: tags,
    env: env
});

eCommerceApiStack.addDependency(productsAppStack);
eCommerceApiStack.addDependency(ordersAppStack);

const invoicesAppLayerStack = new InvoicesAppLayerStack(app, "InvoiceAppLayers", {
    tags: {
        cost: "InvoiceApp",
        team: "HigorCode"
    },
    env: env
});

const invoiceWSApiStack = new InvoiceWSApiStack(app, "InvoiceWSApi", {
    eventsDdb: eventsDdbStack.table,
    auditBus: auditEventBus.bus,
    tags: {
        cost: "InvoiceApp",
        team: "HigorCode"
    },
    env: env
});

invoiceWSApiStack.addDependency(invoicesAppLayerStack);
invoiceWSApiStack.addDependency(eventsDdbStack);
invoiceWSApiStack.addDependency(auditEventBus);

