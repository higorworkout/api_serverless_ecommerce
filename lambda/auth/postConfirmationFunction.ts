import { Callback, Context, PostConfirmationTriggerEvent, PreAuthenticationTriggerEvent } from "aws-lambda";



export async function handler(event: PostConfirmationTriggerEvent, 
    context: Context, callback: Callback): Promise<void> {
  console.log("Post Authentication Function Triggered");
  
  // Log the event for debugging purposes
  console.log("Event: ", JSON.stringify(event, null, 2));

  // You can add your custom logic here

  callback(null, event); // Call the callback with the modified event
  // For example, you might want to check user attributes or modify the event

}