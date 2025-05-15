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
    
    // Add user message to chat immediately
    addMessage('user', message);
    
    // Clear input
    userInput.value = '';
    
    // Show loading indicator
    const loadingId = addMessage('assistant', '...');
    
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
      
      // Replace loading indicator with actual response
      updateMessage(loadingId, data.reply);
      
    } catch (error) {
      console.error('Error:', error);
      updateMessage(loadingId, 'Sorry, something went wrong. Please try again.');
    }
  });
  
  // Function to add a message to the chat
  function addMessage(role, content) {
    const messageId = Date.now();
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.id = `msg-${messageId}`;
    
    // Handle line breaks
    const formattedContent = content.replace(/\n/g, '<br>');
    
    messageDiv.innerHTML = `
      <div class="message-content">
        ${formattedContent}
      </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageId;
  }
  
  // Function to update a message
  function updateMessage(id, content) {
    const messageDiv = document.getElementById(`msg-${id}`);
    if (messageDiv) {
      // Handle line breaks
      const formattedContent = content.replace(/\n/g, '<br>');
      messageDiv.querySelector('.message-content').innerHTML = formattedContent;
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }
});