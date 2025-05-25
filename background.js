// Load config dynamically
let CONFIG = null;
let MD5 = null;

// 加载配置文件
self.importScripts('config.js');

function loadConfig() {
  try {
    if (!self.TranslatorConfig) {
      throw new Error('Could not find TranslatorConfig in config.js');
    }
    
    CONFIG = self.TranslatorConfig.CONFIG;
    MD5 = self.TranslatorConfig.MD5;
    
    console.log('Config loaded successfully:', CONFIG);
  } catch (error) {
    console.error('Failed to load config:', error);
    throw error;
  }
}

// Initialize the background script
function initialize() {
  try {
    loadConfig();
    console.log('Background script initialized successfully');
  } catch (error) {
    console.error('Failed to initialize background script:', error);
  }
}

// Start initialization
initialize();

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
      
    return true;
  }
});

// 处理翻译请求
async function handleTranslation(text) {
  try {
    const salt = Date.now();
    const sign = MD5(
      CONFIG.BAIDU_API.APP_ID + 
      text + 
      salt + 
      CONFIG.BAIDU_API.SECRET_KEY
    );
    
    const params = new URLSearchParams({
      q: text,
      from: CONFIG.TRANSLATION.FROM,
      to: CONFIG.TRANSLATION.TO,
      appid: CONFIG.BAIDU_API.APP_ID,
      salt: salt,
      sign: sign
    });

    console.log('Sending translation request for:', text);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(), 
      CONFIG.BAIDU_API.TIMEOUT
    );

    try {
      const response = await fetch(
        `${CONFIG.BAIDU_API.API_URL}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('API response:', data);

      if (data.error_code) {
        throw new Error(`Translation error: ${data.error_msg}`);
      }

      return data.trans_result[0].dst;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Translation request timed out');
      }
      throw error;
    }
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}