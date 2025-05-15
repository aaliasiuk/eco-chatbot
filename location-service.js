const axios = require('axios');

/**
 * Convert zip code to latitude and longitude using a geocoding service
 * @param {string} zipCode - The zip code to convert
 * @returns {Promise<{latitude: number, longitude: number}>} - The coordinates
 */
async function zipCodeToCoordinates(zipCode) {
  try {
    // Using the free Zippopotam.us API for geocoding
    const response = await axios.get(`https://api.zippopotam.us/us/${zipCode}`);
    
    if (response.data && response.data.places && response.data.places.length > 0) {
      const place = response.data.places[0];
      return {
        latitude: parseFloat(place.latitude),
        longitude: parseFloat(place.longitude)
      };
    }
    throw new Error('Location not found for this zip code');
  } catch (error) {
    console.error('Error converting zip code to coordinates:', error);
    throw error;
  }
}

/**
 * Get locations near the provided coordinates
 * @param {number} latitude - The latitude
 * @param {number} longitude - The longitude
 * @returns {Promise<Array>} - Array of locations
 */
async function getLocations(latitude, longitude) {
  try {
    const url = `https://ws.bullseyelocations.com/RestSearch.svc/DoSearch2?FillAttr=true&GetHoursForUpcomingWeek=true&Radius=1000&StartIndex=0&PageSize=20&LanguageCode=en&Latitude=${latitude}&Longitude=${longitude}&CountryId=1&InterfaceID=${process.env.BULLSEYE_INTERFACE_ID}&ClientId=${process.env.BULLSEYE_CLIENT_ID}&ApiKey=${process.env.BULLSEYE_API_KEY}`;
    
    const response = await axios.get(url);
    
    if (response.data && response.data.ResultList) {
      return response.data.ResultList;
    }
    return [];
  } catch (error) {
    console.error('Error fetching locations:', error);
    throw error;
  }
}

/**
 * Find locations by zip code
 * @param {string} zipCode - The zip code to search
 * @returns {Promise<Array>} - Array of locations
 */
async function findLocationsByZipCode(zipCode) {
  try {
    // First convert zip code to coordinates
    const coordinates = await zipCodeToCoordinates(zipCode);
    
    // Then get locations using those coordinates
    const locations = await getLocations(coordinates.latitude, coordinates.longitude);
    
    return locations;
  } catch (error) {
    console.error('Error finding locations by zip code:', error);
    throw error;
  }
}

module.exports = {
  findLocationsByZipCode
};