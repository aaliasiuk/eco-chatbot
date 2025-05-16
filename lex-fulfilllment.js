// lex-fulfillment.js
const { findLocationsByZipCode } = require('./location-service');
const { getDeviceEstimate } = require('./device-estimate-service');
const { searchRelevantDocuments } = require('./website-knowledge');
const { generateResponse } = require('./bedrock-service');

exports.handler = async (event) => {
  try {
    const intentName = event.interpretations[0].intent.name;
    
    switch (intentName) {
      case 'FindLocationIntent':
        const zipCode = event.interpretations[0].intent.slots.zipCode.value.originalValue;
        return await handleLocationIntent(zipCode);
        
      case 'DeviceEstimateIntent':
        const deviceInfo = {
          brandName: event.interpretations[0].intent.slots.deviceBrand.value.originalValue,
          modelName: event.interpretations[0].intent.slots.deviceModel.value.originalValue,
          storageOption: event.interpretations[0].intent.slots.storageSize.value.originalValue,
          carrierName: event.interpretations[0].intent.slots.carrier.value.originalValue,
          seriesName: event.interpretations[0].intent.slots.deviceModel.value.originalValue
        };
        return await handleDeviceEstimateIntent(deviceInfo);
        
      case 'GeneralQuestionIntent':
        const query = event.inputTranscript;
        return await handleGeneralQuestionIntent(query);
        
      default:
        return {
          sessionState: {
            dialogAction: {
              type: 'Close',
              fulfillmentState: 'Failed'
            }
          },
          messages: [{
            contentType: 'PlainText',
            content: "I'm sorry, I couldn't understand your request."
          }]
        };
    }
  } catch (error) {
    console.error('Error in Lex fulfillment:', error);
    return {
      sessionState: {
        dialogAction: {
          type: 'Close',
          fulfillmentState: 'Failed'
        }
      },
      messages: [{
        contentType: 'PlainText',
        content: "I'm sorry, something went wrong. Please try again later."
      }]
    };
  }
};

async function handleLocationIntent(zipCode) {
  const locations = await findLocationsByZipCode(zipCode);
  
  if (locations && locations.length > 0) {
    const locationsList = locations
      .slice(0, 3)
      .map(loc => `- ${loc.Name}: ${loc.Address}, ${loc.City}, ${loc.State}`)
      .join('\n');
    
    return {
      sessionState: {
        dialogAction: {
          type: 'Close',
          fulfillmentState: 'Fulfilled'
        }
      },
      messages: [{
        contentType: 'PlainText',
        content: `Here are some ecoATM locations near ${zipCode}:\n${locationsList}`
      }]
    };
  } else {
    return {
      sessionState: {
        dialogAction: {
          type: 'Close',
          fulfillmentState: 'Fulfilled'
        }
      },
      messages: [{
        contentType: 'PlainText',
        content: `I couldn't find any ecoATM locations near ${zipCode}.`
      }]
    };
  }
}

// Similar implementations for handleDeviceEstimateIntent and handleGeneralQuestionIntent
