require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const { findLocationsByZipCode } = require('./location-service');
const { initializeKnowledgeBase, searchRelevantDocuments } = require('./website-knowledge');
const { getDeviceEstimate, extractDeviceInfo, isDeviceInfoComplete, getMissingInfoMessage, updateDeviceInfo } = require('./device-estimate-service');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
const apiRoutes = require('./api-routes');
app.use('/api', apiRoutes);

// Store conversation history (in memory - would use a database in production)
const conversations = {};

// Keywords that indicate user is looking for locations
const locationKeywords = [
  'location', 'kiosk', 'near', 'nearby', 'closest', 'nearest', 'find', 'where', 'atm'
];

// Keywords that indicate user is asking for a price estimate
const estimateKeywords = [
  'worth', 'value', 'price', 'estimate', 'offer', 'quote', 'much', 'pay', 'get', 'sell'
];

// API endpoint for chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationId = Date.now().toString() } = req.body;
    
    // Initialize conversation if it doesn't exist
    if (!conversations[conversationId]) {
      conversations[conversationId] = {
        systemPrompt: "You are a helpful customer support assistant for ecoATM, a company that offers automated kiosks that buy back used cell phones and other electronic devices for cash. Be friendly, concise, and helpful. Base your answers on the information provided in the context. If you don't know something or if the information isn't in the provided context, say so politely.",
        messages: [],
        awaitingZipCode: false,
        awaitingDeviceInfo: false
      };
    }
    
    // Add user message to conversation
    conversations[conversationId].messages.push({ role: "user", content: message });
    
    // Check if message contains a zip code
    const zipCodeMatch = message.match(/\b\d{5}(-\d{4})?\b/);
    let reply;
    
    if (zipCodeMatch) {
      const zipCode = zipCodeMatch[0];
      try {
        // Get locations for the zip code
        const locations = await findLocationsByZipCode(zipCode);
        
        if (locations && locations.length > 0) {
          // Format the first 3 locations for display
          const locationsList = locations
            .slice(0, 3)
            .map(loc => `- ${loc.Name}: ${loc.Address}, ${loc.City}, ${loc.State}`)
            .join('\n');
          
          reply = `Here are some ecoATM locations near ${zipCode}:\n${locationsList}`;
          
          // Reset the awaiting zip code flag
          conversations[conversationId].awaitingZipCode = false;
        } else {
          reply = `I couldn't find any ecoATM locations near ${zipCode}. Please try another zip code or visit our website at ecoatm.com to use the location finder.`;
          
          // Reset the awaiting zip code flag
          conversations[conversationId].awaitingZipCode = false;
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
        reply = "I'm having trouble finding locations right now. Please try again later or visit our website at ecoatm.com to use the location finder.";
        
        // Reset the awaiting zip code flag
        conversations[conversationId].awaitingZipCode = false;
      }
    } else if (conversations[conversationId].awaitingZipCode) {
      // User didn't provide a zip code but we're waiting for one
      reply = "To find ecoATM locations near you, I'll need your zip code. Please enter your 5-digit zip code.";
    } else {
      // Check if this is a location-related query or a response to a location question
      const isLocationQuery = locationKeywords.some(keyword => {
        // Check if the keyword is a standalone word, not part of another word
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(message);
      });
      
      const lastMessage = conversations[conversationId].messages.length > 1 ? 
        conversations[conversationId].messages[conversations[conversationId].messages.length - 2] : null;
      
      const previouslyAskedAboutLocation = lastMessage && 
        lastMessage.role === 'assistant' && 
        lastMessage.content.includes('nearest ecoATM location');
      
      const isAffirmativeResponse = /^(yes|yeah|yep|sure|ok|okay|find|show)$/i.test(message.trim());
      
      // Check if this is a "what is" question about ecoATM
      const isWhatIsQuestion = /what\s+is\s+(?:an\s+)?ecoatm/i.test(message);
      
      if (!isWhatIsQuestion && (isLocationQuery || (previouslyAskedAboutLocation && isAffirmativeResponse)) && !zipCodeMatch) {
        // This is a location query but no zip code provided
        reply = "I'd be happy to help you find the nearest ecoATM kiosk! To locate the closest kiosk to you, I'll need your zip code. Please enter your 5-digit zip code.";
        
        // Set the awaiting zip code flag
        conversations[conversationId].awaitingZipCode = true;
      } else {
        // Check if this is a device estimate query
        const isEstimateQuery = estimateKeywords.some(keyword => 
          message.toLowerCase().includes(keyword)
        ) && (
          message.toLowerCase().includes('phone') || 
          message.toLowerCase().includes('iphone') || 
          message.toLowerCase().includes('samsung') || 
          message.toLowerCase().includes('device')
        );
        
        if (isEstimateQuery || conversations[conversationId].awaitingDeviceInfo) {
          try {
            // Try to extract device info from the message
            let deviceInfo = extractDeviceInfo(message);
            
            // If we already have partial info stored, update it with any new info
            if (conversations[conversationId].partialDeviceInfo && deviceInfo) {
              deviceInfo = updateDeviceInfo(conversations[conversationId].partialDeviceInfo, deviceInfo);
            } else if (conversations[conversationId].partialDeviceInfo) {
              deviceInfo = conversations[conversationId].partialDeviceInfo;
            }
            
            if (deviceInfo) {
              // Check if we have all the required information
              if (isDeviceInfoComplete(deviceInfo)) {
                // We have all the info, get an estimate
                const estimate = await getDeviceEstimate(deviceInfo);
                
                if (estimate && estimate.offer) {
                  reply = `Based on the information provided, your ${deviceInfo.brandName} ${deviceInfo.modelName} (${deviceInfo.storageOption}, ${deviceInfo.carrierName}) is estimated to be worth ${estimate.offer}. This is an estimate for a device that powers on, has no screen damage, and no cracks. The actual offer may vary based on the condition of your device when assessed at an ecoATM kiosk.`;
                  
                  // Clear the stored device info and flags
                  delete conversations[conversationId].partialDeviceInfo;
                  conversations[conversationId].awaitingDeviceInfo = false;
                } else {
                  reply = "I'm sorry, I couldn't get an estimate for that device. Please check that the device information is correct or try a different device.";
                  delete conversations[conversationId].partialDeviceInfo;
                  conversations[conversationId].awaitingDeviceInfo = false;
                }
              } else {
                // We're missing some info, ask for it
                reply = getMissingInfoMessage(deviceInfo);
                
                // Store the partial info we have
                conversations[conversationId].partialDeviceInfo = deviceInfo;
                conversations[conversationId].awaitingDeviceInfo = true;
              }
            } else if (conversations[conversationId].awaitingDeviceInfo) {
              // Still waiting for device info but couldn't extract anything useful
              reply = "I'm still having trouble understanding which device you want to get an estimate for. Please provide the brand (like Apple, Samsung), model (like iPhone 13, Galaxy S21), storage size (like 128GB), and carrier (like Verizon, AT&T).";
            } else {
              // First time asking, but couldn't extract any device info
              reply = "I'd be happy to give you an estimate for your device! To provide an accurate estimate, I need to know the brand (like Apple, Samsung), model (like iPhone 13, Galaxy S21), storage size (like 128GB), and carrier (like Verizon, AT&T). Could you please provide these details?";
              
              // Set the awaiting device info flag
              conversations[conversationId].awaitingDeviceInfo = true;
            }
          } catch (error) {
            console.error('Error getting device estimate:', error);
            reply = "I'm sorry, I encountered an error while trying to get an estimate for your device. Please try again later.";
            conversations[conversationId].awaitingDeviceInfo = false;
            delete conversations[conversationId].partialDeviceInfo;
          }
        } else {
          // Regular query - search for relevant documents
          const relevantDocs = searchRelevantDocuments(message, 3);
          
          // Create context from relevant documents
          let context = "";
          if (relevantDocs.length > 0) {
            context = "Here is information from ecoATM's website that may help answer the question:\n\n" +
              relevantDocs.map(doc => `From ${doc.source}:\n${doc.content}`).join('\n\n') +
              "\n\nPlease use this information to answer the user's question.";
          }
          
          // Format messages for Anthropic API
          const formattedMessages = conversations[conversationId].messages.map(msg => ({
            role: msg.role,
            content: msg.content
          }));
          
          // Get response from Anthropic
          const completion = await anthropic.messages.create({
            model: "claude-3-7-sonnet-20250219",
            system: conversations[conversationId].systemPrompt + (context ? "\n\n" + context : ""),
            messages: formattedMessages,
            max_tokens: 500
          });
          
          reply = completion.content[0].text;
        }
      }
    }
    
    // Add assistant response to conversation history
    conversations[conversationId].messages.push({ role: "assistant", content: reply });
    
    // Return response with user's message included
    res.json({ 
      reply,
      userMessage: message, 
      conversationId 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// API endpoint for location search
app.get('/api/locations/:zipCode', async (req, res) => {
  try {
    const { zipCode } = req.params;
    
    // Validate zip code format (basic US format)
    if (!/^\d{5}(-\d{4})?$/.test(zipCode)) {
      return res.status(400).json({ error: 'Invalid zip code format' });
    }
    
    const locations = await findLocationsByZipCode(zipCode);
    res.json({ locations });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// Initialize knowledge base before starting server
initializeKnowledgeBase().then(() => {
  // Start server
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
