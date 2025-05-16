const axios = require('axios');

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
    
    const response = await axios({
      url: 'https://api-qa.ecoatm.com/omni/v1/graphql',
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
 * Extract device information from user message
 * @param {string} message - User message
 * @returns {Object} - Extracted device info with missing fields marked
 */
function extractDeviceInfo(message) {
  // Simple extraction logic - in production, use NLP or more sophisticated parsing
  const modelRegex = /(iphone|galaxy|pixel)\s*(\d+)(\s*pro)?(\s*max)?/i;
  const storageRegex = /(\d+)\s*(gb|tb)/i;
  const carrierRegex = /(verizon|at&t|t-mobile|sprint|unlocked)/i;
  
  const modelMatch = message.match(modelRegex);
  const storageMatch = message.match(storageRegex);
  const carrierMatch = message.match(carrierRegex);
  
  // Create result object
  const result = {};
  
  // Extract model and brand if available
  if (modelMatch) {
    const brandMap = {
      'iphone': 'Apple',
      'galaxy': 'Samsung',
      'pixel': 'Google'
    };
    
    const brandName = brandMap[modelMatch[1].toLowerCase()] || 'Unknown';
    let modelName = `${modelMatch[1].charAt(0).toUpperCase() + modelMatch[1].slice(1).toLowerCase()} ${modelMatch[2]}`;
    
    if (modelMatch[3]) modelName += modelMatch[3]; // Add "Pro" if present
    if (modelMatch[4]) modelName += modelMatch[4]; // Add "Max" if present
    
    result.modelName = modelName;
    result.seriesName = modelName;
    result.brandName = brandName;
  }
  
  // Extract storage if available
  if (storageMatch) {
    result.storageOption = `${storageMatch[1]}${storageMatch[2].toUpperCase()}`;
  }
  
  // Extract carrier if available
  if (carrierMatch) {
    result.carrierName = carrierMatch[1].charAt(0).toUpperCase() + carrierMatch[1].slice(1).toLowerCase();
  }
  
  // If we have at least one piece of information, return the result
  if (Object.keys(result).length > 0) {
    result.missingInfo = {
      storage: !result.storageOption,
      carrier: !result.carrierName,
      model: !result.modelName
    };
    return result;
  }
  
  // If we couldn't extract anything, return null
  return null;
}

/**
 * Check if device info is complete
 * @param {Object} deviceInfo - Device information object
 * @returns {boolean} - Whether all required info is present
 */
function isDeviceInfoComplete(deviceInfo) {
  return deviceInfo && 
         deviceInfo.modelName && 
         deviceInfo.brandName && 
         deviceInfo.storageOption && 
         deviceInfo.carrierName;
}

/**
 * Get missing information message
 * @param {Object} deviceInfo - Device information object
 * @returns {string} - Message asking for missing information
 */
function getMissingInfoMessage(deviceInfo) {
  const missingFields = [];
  
  if (!deviceInfo.storageOption) {
    missingFields.push("storage capacity (e.g., 128GB, 256GB)");
  }
  
  if (!deviceInfo.carrierName) {
    missingFields.push("carrier (e.g., Verizon, AT&T, T-Mobile, or Unlocked)");
  }
  
  const deviceDesc = `${deviceInfo.brandName} ${deviceInfo.modelName}`;
  
  if (missingFields.length === 0) {
    return null;
  } else if (missingFields.length === 1) {
    return `To provide an accurate estimate for your ${deviceDesc}, I need to know the ${missingFields[0]}. Could you please provide this information?`;
  } else {
    return `To provide an accurate estimate for your ${deviceDesc}, I need to know the ${missingFields.join(' and ')}. Could you please provide this information?`;
  }
}

/**
 * Update device info with new information from user message
 * @param {Object} existingInfo - Previously stored device info
 * @param {Object} newInfo - Newly extracted device info
 * @returns {Object} - Updated device info
 */
function updateDeviceInfo(existingInfo, newInfo) {
  if (!existingInfo) return newInfo;
  if (!newInfo) return existingInfo;
  
  const updated = {
    modelName: newInfo.modelName || existingInfo.modelName,
    seriesName: newInfo.seriesName || existingInfo.seriesName,
    brandName: newInfo.brandName || existingInfo.brandName,
    storageOption: newInfo.storageOption || existingInfo.storageOption,
    carrierName: newInfo.carrierName || existingInfo.carrierName
  };
  
  updated.missingInfo = {
    storage: !updated.storageOption,
    carrier: !updated.carrierName,
    model: !updated.modelName
  };
  
  return updated;
}

module.exports = {
  getDeviceEstimate,
  extractDeviceInfo,
  isDeviceInfoComplete,
  getMissingInfoMessage,
  updateDeviceInfo
};
