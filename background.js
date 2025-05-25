// Configuration
const CONFIG = {
  DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
  MAX_CACHE_SIZE: 100,
  MAX_RETRIES: 3
};

// 监听来自content script的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Received message:', request);
  
  if (request.action === 'translate') {
    handleTranslation(request.text)
      .then(translation => {
        console.log('Translation success:', translation);
        sendResponse({ success: true, translation });
      })
      .catch(error => {
        console.error('Translation error:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Translation failed'
        });
      });
      
    // 返回true表示我们将异步发送响应
    return true;
  }
});

// 处理翻译请求
async function handleTranslation(text) {
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error('API key not found. Please set your DeepSeek API key in the extension settings.');
    }

    console.log('Sending translation request for:', text);
    
    const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a professional translator. Translate the following English text to Chinese. Only provide the translation, no explanations or additional text."
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('API response:', data);

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response from API');
    }

    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}

// 从存储中获取API key
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiKey'], (result) => {
      resolve(result.apiKey || null);
    });
  });
} 