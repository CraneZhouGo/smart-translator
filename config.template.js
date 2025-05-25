// 创建一个命名空间
const TranslatorConfig = {
  // 百度翻译 API 配置
  CONFIG: {
    // 百度翻译 API 配置
    BAIDU_API: {
      APP_ID: 'YOUR_APP_ID_HERE',
      SECRET_KEY: 'YOUR_SECRET_KEY_HERE',
      API_URL: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
      TIMEOUT: 10000
    },
    
    // 翻译配置
    TRANSLATION: {
      FROM: 'en',
      TO: 'zh',
      MAX_LENGTH: 2000,
      MIN_LENGTH: 2
    },

    // 缓存配置
    CACHE: {
      MAX_SIZE: 100,
      EXPIRE_TIME: 24 * 60 * 60 * 1000, // 24小时
      CLEANUP_INTERVAL: 60 * 60 * 1000   // 每小时清理一次
    },

    // UI配置
    UI: {
      POPUP_MAX_WIDTH: 300,
      POPUP_OFFSET: 10,
      DEBOUNCE_DELAY: 300,
      FADE_DURATION: 200
    }
  },

  // MD5 加密函数
  MD5: function(string) {
    // ... 保持原有的 MD5 实现 ...
  }
};

// 检查是否在 Service Worker 环境中
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  // ... 保持原有的消息处理逻辑 ...
}

// 导出配置
if (typeof window !== 'undefined') {
  window.TranslatorConfig = TranslatorConfig;
} 