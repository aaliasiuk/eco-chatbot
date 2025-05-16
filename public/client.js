document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('chat-form');
  const userInput = document.getElementById('user-input');
  const chatMessages = document.getElementById('chat-messages');
  
  // Store conversation ID
  let conversationId = null;
  
  // Handle form submission
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const message = userInput.value.trim();
    if (!message) return;
    
    // Display user message first
    displayUserMessage(message);
    
    // Clear input
    userInput.value = '';
    
    try {
      // Send message to server
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          message,
          conversationId
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get response');
      }
      
      const data = await response.json();
      
      // Update conversation ID
      conversationId = data.conversationId;
      
      // Display bot response
      displayBotMessage(data.reply);
      
    } catch (error) {
      console.error('Error:', error);
      displayBotMessage('Sorry, something went wrong. Please try again.');
    }
  });
  
  // Function to display user message
  function displayUserMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    
    // Handle line breaks
    const formattedContent = message.replace(/\n/g, '<br>');
    
    messageDiv.innerHTML = `
      <div class="message-content">
        ${formattedContent}
      </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // Function to display bot message
  function displayBotMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    
    // Handle line breaks
    const formattedContent = message.replace(/\n/g, '<br>');
    
    messageDiv.innerHTML = `
      <div class="message-content">
        ${formattedContent}
      </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});