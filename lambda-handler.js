// lambda-handler.js
const { LexRuntimeV2Client, RecognizeTextCommand } = require("@aws-sdk/client-lex-runtime-v2");

const lexClient = new LexRuntimeV2Client({ region: "us-east-1" });
const botId = process.env.LEX_BOT_ID;
const botAliasId = process.env.LEX_BOT_ALIAS_ID;

exports.handler = async (event) => {
  try {
    // Parse request
    const body = JSON.parse(event.body);
    const { message, conversationId = Date.now().toString() } = body;
    
    // Call Lex
    const params = {
      botId,
      botAliasId,
      localeId: "en_US",
      sessionId: conversationId,
      text: message
    };
    
    const command = new RecognizeTextCommand(params);
    const lexResponse = await lexClient.send(command);
    
    // Format response
    let reply = "";
    if (lexResponse.messages && lexResponse.messages.length > 0) {
      reply = lexResponse.messages[0].content;
    } else {
      reply = "I'm sorry, I couldn't process your request.";
    }
    
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        reply,
        userMessage: message,
        conversationId
      })
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: "Something went wrong" })
    };
  }
};
