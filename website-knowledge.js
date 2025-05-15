const axios = require('axios');
const cheerio = require('cheerio');
const { encode } = require('gpt-3-encoder');

// Simple in-memory vector store (use a proper vector DB in production)
const documents = [];
const vectorStore = [];

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magA * magB);
}

/**
 * Create a simple embedding (this is a placeholder - use a real embedding API in production)
 * In production, use OpenAI's embedding API or another embedding service
 */
function createEmbedding(text) {
  // This is a very simplified embedding function
  // In production, use a proper embedding API
  const tokens = encode(text.toLowerCase());
  const vector = Array(1536).fill(0); // Simplified 1536-dim vector
  
  // Create a very simple embedding based on token IDs
  // This is NOT a proper embedding, just a placeholder
  tokens.forEach((token, i) => {
    const idx = token % vector.length;
    vector[idx] += 1;
  });
  
  // Normalize the vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
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
      .replace(/\\s+/g, ' ')
      .replace(/\\n+/g, ' ')
      .trim();
    
    // Create chunks of content (simplified)
    const chunkSize = 1000;
    for (let i = 0; i < cleanContent.length; i += chunkSize) {
      const chunk = cleanContent.slice(i, i + chunkSize);
      const document = {
        url,
        title,
        content: chunk,
        source: `${title} (${url})`
      };
      
      // Create embedding and store
      const embedding = createEmbedding(chunk);
      documents.push(document);
      vectorStore.push(embedding);
    }
    
    return true;
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return false;
  }
}

/**
 * Search for relevant documents based on a query
 */
function searchRelevantDocuments(query, topK = 3) {
  const queryEmbedding = createEmbedding(query);
  
  // Calculate similarities
  const similarities = vectorStore.map((docEmbedding) => 
    cosineSimilarity(queryEmbedding, docEmbedding)
  );
  
  // Get top K results
  const topIndices = similarities
    .map((score, idx) => ({ score, idx }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(item => item.idx);
  
  return topIndices.map(idx => documents[idx]);
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
  for (const url of urls) {
    console.log(`Scraping ${url}...`);
    await scrapeAndIndex(url);
  }
  console.log(`Knowledge base initialized with ${documents.length} chunks`);
}

module.exports = {
  initializeKnowledgeBase,
  searchRelevantDocuments
};