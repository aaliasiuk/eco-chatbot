const axios = require('axios');
const cheerio = require('cheerio');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

// DynamoDB table name for document storage
const DOCUMENTS_TABLE = process.env.DOCUMENTS_TABLE || 'ecoatm-knowledge-documents';

/**
 * Calculate cosine similarity betwee<mmarker-index=15 reference-tracker>ark marker-index=14 reference-tracker>n two vecter-index=12 reference-tracker>ors
 */
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magA * magB);
}

/**
 * Create embeddings using Amazon Bedrock
 * @param {string} text - Text to embed
 * @returns {Promise<Array<number>>} - Embedding vector
 */
async function createEmbedding(text) {
  try {
    // Use Amazon Titan Embeddings model
    const command = new InvokeModelCommand({
      modelId: "amazon.titan-embed-text-v1",
      contentType: "application/json",
      body: JSON.stringify({
        inputText: text.substring(0, 8000) // Limit to model's context window
      })
    });
    
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    return responseBody.embedding;
  } catch (error) {
    console.error("Error creating embedding:", error);
    
    // Fallback to simple embedding if Bedrock fails
    return createSimpleEmbedding(text);
  }
}

/**
 * Simple fallback embedding function
 * @param {string} text - Text to embed
 * @returns {Array<number>} - Simple embedding vector
 */
function createSimpleEmbedding(text) {
  // Create a simple hash-based embedding (for fallback only)
  const vector = Array(1536).fill(0);
  
  const words = text.toLowerCase().split(/\W+/);
  words.forEach(word => {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
    }
    const idx = Math.abs(hash) % vector.length;
    vector[idx] += 1;
  });
  
  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
  return vector.map(val => val / magnitude);
}

/**
 * Scrape and index a webpage
 */
async function scrapeAndIndex(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    // Remove script tags, styles, and other non-content elements
    $('script, style, nav, footer, header, [role="navigation"]').remove();
    
    // Extract main content
    const title = $('title').text().trim();
    const mainContent = $('main, article, .content, #content, .main').text() || $('body').text();
    const cleanContent = mainContent
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();
    
    // Create chunks of content
    const chunkSize = 1000;
    const chunks = [];
    
    for (let i = 0; i < cleanContent.length; i += chunkSize) {
      const chunk = cleanContent.slice(i, i + chunkSize);
      const documentId = `${url.replace(/[^a-zA-Z0-9]/g, '-')}-${i}`;
      
      const document = {
        id: documentId,
        url,
        title,
        content: chunk,
        source: `${title} (${url})`,
        timestamp: new Date().toISOString()
      };
      
      // Create embedding
      const embedding = await createEmbedding(chunk);
      
      // Store in DynamoDB
      await docClient.send(new PutCommand({
        TableName: DOCUMENTS_TABLE,
        Item: {
          ...document,
          embedding
        }
      }));
      
      chunks.push(documentId);
    }
    
    console.log(`Indexed ${chunks.length} chunks from ${url}`);
    return chunks.length;
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return 0;
  }
}

/**
 * Search for relevant documents based on a query
 */
async function searchRelevantDocuments(query, topK = 3) {
  try {
    // Create embedding for the query
    const queryEmbedding = await createEmbedding(query);
    
    // Scan DynamoDB for all documents
    // In production, use a vector database like Amazon OpenSearch with k-NN
    const scanResult = await docClient.send(new ScanCommand({
      TableName: DOCUMENTS_TABLE
    }));
    
    if (!scanResult.Items || scanResult.Items.length === 0) {
      return [];
    }
    
    // Calculate similarities
    const documentsWithScores = scanResult.Items.map(item => ({
      document: {
        url: item.url,
        title: item.title,
        content: item.content,
        source: item.source
      },
      score: cosineSimilarity(queryEmbedding, item.embedding)
    }));
    
    // Sort by similarity score and take top K
    return documentsWithScores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => item.document);
  } catch (error) {
    console.error('Error searching documents:', error);
    return [];
  }
}

/**
 * Initialize the knowledge base with key ecoATM pages
 */
async function initializeKnowledgeBase() {
  const urls = [
    'https://www.ecoatm.com/how-it-works/',
    'https://www.ecoatm.com/faq/',
    'https://www.ecoatm.com/privacy-policy/',
    'https://www.ecoatm.com/terms-and-conditions/',
    'https://www.ecoatm.com/what-we-buy/'
  ];
  
  console.log('Initializing knowledge base...');
  let totalChunks = 0;
  
  for (const url of urls) {
    console.log(`Scraping ${url}...`);
    const chunks = await scrapeAndIndex(url);
    totalChunks += chunks;
  }
  
  console.log(`Knowledge base initialized with ${totalChunks} total chunks`);
  return totalChunks;
}

module.exports = {
  initializeKnowledgeBase,
  searchRelevantDocuments
};
