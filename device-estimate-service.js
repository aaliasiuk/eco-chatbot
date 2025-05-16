const axios = require('axios');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

// Initialize AWS clients
const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Get a price estimate for a device
 * @param {Object} deviceInfo - Information about the device
 * @param {string} deviceInfo.modelName - Model name (e.g., "iPhone 16")
 * @param {string} deviceInfo.seriesName - Series name (e.g., "iPhone 16")
 * @param {string} deviceInfo.storageOption - Storage option (e.g., "128GB")
 * @param {string} deviceInfo.carrierName - Carrier name (e.g., "Verizon")
 * @param {string} deviceInfo.brandName - Brand name (e.g., "Apple")
 * @returns {Promise<Object>} - The estimate response
 */
async function getDeviceEstimate(deviceInfo) {
  try {
    const { modelName, seriesName, storageOption, carrierName, brandName } = deviceInfo;
    
    // Default values for non-variable fields
    const categoryId = "8fbcad05-0bbf-4ba7-ba0c-1d4f36bc1022"; // Phone category
    
    const query = `
      query Payout {
        payout(
          modelName: "${modelName}"
          seriesName: "${seriesName}"
          storageOption: "${storageOption}"
          carrierName: "${carrierName}"
          categoryId: "${categoryId}"
          powerUp: true
          lcdOK: true
          cracks: false
          channelName: WEB
          brandName: "${brandName}"
        ) {
          deviceId
          offerId
          offer
          offerV2
          onlineOffer
          onlineOfferV2
          readyForSale
          moratoriumEndDate
          recyclable
          offerState
        }
      }
    `;
    
    // Get API endpoint from SSM Parameter Store (for flexibility across environments)
    const endpointParam = await ssmClient.send(
      new GetParameterCommand({ Name: '/ecoatm/api/graphql-endpoint' })
    );
    const endpoint = endpointParam.Parameter.Value || 'https://api-qa.ecoatm.com/omni/v1/graphql';
    
    const response = await axios({
      url: endpoint,
      method: 'post',
      data: {
        query
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }
    
    return response.data.data.payout;
  } catch (error) {
    console.error('Error getting device estimate:', error);
    throw error;
  }
}

/**
 * Extract device information from user message or Lex slots
 * @param {Object} input - Either a string message or Lex slots
 * @returns {Object|null} - Extracted device info or null if not enough info
 */
function extractDeviceInfo(input) {
  // If input is from Lex slots, use that directly
  if (typeof input === 'object' && input !== null) {
    const { deviceBrand, deviceModel, storageSize, carrier } = input;
    
    if (deviceBrand && deviceModel) {
      return {
        modelName: deviceModel,
        seriesName: deviceModel,
        storageOption: storageSize || "128GB",
        carrierName: carrier || "Verizon",
        brandName: deviceBrand
      };
    }
    return null;
  }
  
  // Otherwise parse from message string
  const message = input;
  const modelRegex = /(iphone|galaxy|pixel)\s*(\d+)(\s*pro)?(\s*max)?/i;
  const storageRegex = /(\d+)\s*(gb|tb)/i;
  const carrierRegex = /(verizon|at&t|t-mobile|sprint|unlocked)/i;
  
  const modelMatch = message.match(modelRegex);
  const storageMatch = message.match(storageRegex);
  const carrierMatch = message.match(carrierRegex);
  
  if (!modelMatch) return null;
  
  const brandMap = {
    'iphone': 'Apple',
    'galaxy': 'Samsung',
    'pixel': 'Google'
  };
  
  const brandName = brandMap[modelMatch[1].toLowerCase()] || 'Unknown';
  let modelName = `${modelMatch[1].charAt(0).toUpperCase() + modelMatch[1].slice(1).toLowerCase()} ${modelMatch[2]}`;
  
  if (modelMatch[3]) modelName += modelMatch[3]; // Add "Pro" if present
  if (modelMatch[4]) modelName += modelMatch[4]; // Add "Max" if present
  
  const seriesName = modelName;
  const storageOption = storageMatch ? `${storageMatch[1]}${storageMatch[2].toUpperCase()}` : "128GB";
  const carrierName = carrierMatch ? carrierMatch[1].charAt(0).toUpperCase() + carrierMatch[1].slice(1).toLowerCase() : "Verizon";
  
  return {
    modelName,
    seriesName,
    storageOption,
    carrierName,
    brandName
  };
}

/**
 * Format device estimate for response
 * @param {Object} deviceInfo - Device information
 * @param {Object} estimate - Estimate data from API
 * @returns {string} - Formatted response
 */
function formatEstimateResponse(deviceInfo, estimate) {
  if (!estimate || !estimate.offer) {
    return `I'm sorry, I couldn't get an estimate for your ${deviceInfo.brandName} ${deviceInfo.modelName}.`;
  }
  
  return `Based on the information provided, your ${deviceInfo.brandName} ${deviceInfo.modelName} (${deviceInfo.storageOption}, ${deviceInfo.carrierName}) is estimated to be worth $${estimate.offer}. This is an estimate for a device that powers on, has no screen damage, and no cracks. The actual offer may vary based on the condition of your device when assessed at an ecoATM kiosk.`;
}

module.exports = {
  getDeviceEstimate,
  extractDeviceInfo,
  formatEstimateResponse
};
