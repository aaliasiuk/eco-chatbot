const express = require('express');
const router = express.Router();
const { getDeviceEstimate } = require('./device-estimate-service');

/**
 * API endpoint for getting device estimates
 */
router.post('/estimate', async (req, res) => {
  try {
    const { modelName, seriesName, storageOption, carrierName, brandName } = req.body;
    
    // Validate required fields
    if (!modelName || !seriesName || !storageOption || !carrierName || !brandName) {
      return res.status(400).json({ 
        error: 'Missing required device information' 
      });
    }
    
    const estimate = await getDeviceEstimate({
      modelName,
      seriesName,
      storageOption,
      carrierName,
      brandName
    });
    
    res.json({ estimate });
  } catch (error) {
    console.error('Error getting device estimate:', error);
    res.status(500).json({ error: 'Failed to get device estimate' });
  }
});

module.exports = router;