// bedrock-service.js
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const bedrockClient = new BedrockRuntimeClient({ region: "us-east-1" });

async function generateResponse(messages, systemPrompt, context = "") {
  try {
    const fullPrompt = systemPrompt + (context ? "\n\n" + context : "");
    
    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 500,
      messages: messages,
      system: fullPrompt
    };
    
    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
      contentType: "application/json",
      body: JSON.stringify(payload)
    });
    
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    return responseBody.content[0].text;
  } catch (error) {
    console.error("Error calling Bedrock:", error);
    throw error;
  }
}

module.exports = { generateResponse };
