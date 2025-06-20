import { Context, SQSEvent,  SNSMessage } from 'aws-lambda';
import * as AWSXRay from 'aws-xray-sdk-core';
import { Envelope, OrderEvent } from '/opt/nodejs/orderEventsLayer';
import { AWSError, SES } from 'aws-sdk';
import { PromiseResult } from 'aws-sdk/lib/request';

AWSXRay.captureAWS(require('aws-sdk'));

const sesClient = new SES();
export async function handler(event: SQSEvent, context: Context): Promise<void> {
    const promises: Promise<PromiseResult<SES.SendEmailResponse, AWSError>>[] = [];

    event.Records.forEach(async (record) => {
        console.log(record);
        const body = JSON.parse(record.body) as SNSMessage;
        promises.push(sendOrderEmail(body));
    });

    await Promise.all(promises);

    return
}

function sendOrderEmail(body: SNSMessage){
  const envelope = JSON.parse(body.Message) as Envelope;
  const event = JSON.parse(envelope.data) as OrderEvent;

  return sesClient.sendEmail({
    Destination: {
      ToAddresses: [event.email]
    },
    Message: {
      Body: {
        Text: {
          Charset: "UTF-8",
          Data: `Recebemos seu pedido de código ${event.orderId} no valor de ${event.billing.totalPrice}`,
        }
      },
      Subject: {
        Charset: "UTF-8",
        Data: "Pedido recebido!"
      }
    },
    Source: "hianeraiane@gmail.com",
    ReplyToAddresses: ["hianeraiane@gmail.com"]
  }).promise()    
}