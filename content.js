// Translation popup class
class TranslationPopup {
  constructor() {
    this.popup = null;
    this.content = null;
    this.init();
    this.setupEventListeners();
  }

  init() {
    // Create shadow root container
    const container = document.createElement('div');
    container.id = 'deepseek-translator-container';
    const shadow = container.attachShadow({ mode: 'closed' });

    // Create popup elements
    this.popup = document.createElement('div');
    this.popup.className = 'translation-popup';
    this.content = document.createElement('div');
    this.content.className = 'translation-content';
    
    // Add loading spinner
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    this.content.appendChild(spinner);

    // Apply styles
    const style = document.createElement('style');
    style.textContent = `
      .translation-popup {
        position: fixed;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        padding: 12px;
        max-width: 300px;
        z-index: 999999;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .translation-content {
        font-size: 14px;
        line-height: 1.5;
        color: #333;
      }
      .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 10px auto;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .fade-in {
        animation: fadeIn 0.3s ease-in;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;

    this.popup.appendChild(this.content);
    shadow.appendChild(style);
    shadow.appendChild(this.popup);
    document.body.appendChild(container);
  }

  setupEventListeners() {
    // 点击事件委托到document
    document.addEventListener('click', (e) => {
      // 检查点击是否在弹窗内
      const isClickInside = e.composedPath().some(element => {
        return element === this.popup || element === this.content;
      });

      // 只有点击在弹窗外时才关闭
      if (this.popup.style.display === 'block' && !isClickInside) {
        this.hide();
      }
    });

    // Close popup on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  show(x, y) {
    this.popup.style.display = 'block';
    this.popup.classList.add('fade-in');
    
    // Position the popup
    const rect = this.popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust x position if popup would go off screen
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 10;
    }

    // Adjust y position if popup would go off screen
    if (y + rect.height > viewportHeight) {
      y = y - rect.height - 10;
    }

    this.popup.style.left = `${x}px`;
    this.popup.style.top = `${y}px`;
  }

  hide() {
    this.popup.style.display = 'none';
  }

  setContent(text) {
    this.content.innerHTML = text;
  }

  showLoading() {
    this.content.innerHTML = '<div class="spinner"></div>';
  }
}

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Translation cache and helper functions
class SmartTranslationCache {
  constructor() {
    this.cache = new Map();
    this.phraseCache = new Map();
  }

  // 规范化文本，移除多余空格，转换为小写
  normalizeText(text) {
    return text.trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  // 清理文本，移除标点符号
  cleanText(text) {
    return text.replace(/[.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*]/g, '')
      .trim()
      .toLowerCase();
  }

  // 将文本分割成短语和句子
  splitText(text) {
    // 首先按句子分割
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    // 然后将每个句子分割成短语（3-6个单词的组合）
    const phrases = [];
    sentences.forEach(sentence => {
      const words = sentence.trim().split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        for (let len = 3; len <= 6 && i + len <= words.length; len++) {
          const phrase = words.slice(i, i + len).join(' ');
          if (phrase.length > 10) { // 只缓存长度超过10个字符的短语
            phrases.push(phrase);
          }
        }
      }
    });
    
    return {
      sentences,
      phrases: [...new Set(phrases)] // 去重
    };
  }

  // 检查文本是否已被完整缓存
  hasExactMatch(text) {
    const normalized = this.normalizeText(text);
    return this.cache.has(normalized);
  }

  // 获取完整缓存的翻译
  getExactMatch(text) {
    const normalized = this.normalizeText(text);
    return this.cache.get(normalized);
  }

  // 检查文本中可复用的部分
  findReusableContent(text) {
    const { sentences, phrases } = this.splitText(text);
    const reusable = new Map();
    let totalLength = 0;
    
    // 检查完整句子
    sentences.forEach(sentence => {
      const normalized = this.normalizeText(sentence);
      const cached = this.cache.get(normalized);
      if (cached) {
        reusable.set(normalized, cached);
        totalLength += sentence.length;
      }
    });

    // 如果句子没有完全覆盖，检查短语
    if (totalLength < text.length * 0.8) { // 如果句子覆盖率低于80%
      phrases.forEach(phrase => {
        const normalized = this.normalizeText(phrase);
        const cached = this.phraseCache.get(normalized);
        if (cached) {
          reusable.set(normalized, cached);
        }
      });
    }

    return {
      reusable,
      isFullyCovered: totalLength >= text.length * 0.8 // 如果覆盖率达到80%以上，认为已完全覆盖
    };
  }

  // 缓存翻译结果
  cacheTranslation(text, translation) {
    const normalized = this.normalizeText(text);
    this.cache.set(normalized, translation);

    // 如果文本包含多个句子，也缓存单个句子和短语
    const { sentences, phrases } = this.splitText(text);
    const translatedParts = this.splitText(translation);

    if (sentences.length === translatedParts.sentences.length) {
      sentences.forEach((sentence, index) => {
        const normalizedSentence = this.normalizeText(sentence);
        this.cache.set(normalizedSentence, translatedParts.sentences[index]);
      });

      // 缓存短语（仅当句子数量匹配时）
      phrases.forEach(phrase => {
        const normalizedPhrase = this.normalizeText(phrase);
        // 在翻译结果中查找对应的中文
        const chinesePhrase = this.findChinesePhrase(phrase, text, translation);
        if (chinesePhrase) {
          this.phraseCache.set(normalizedPhrase, chinesePhrase);
        }
      });
    }
  }

  // 在翻译结果中查找对应的中文短语
  findChinesePhrase(englishPhrase, originalText, translation) {
    const index = originalText.toLowerCase().indexOf(englishPhrase.toLowerCase());
    if (index === -1) return null;

    // 根据位置比例在翻译中查找对应部分
    const ratio = index / originalText.length;
    const estimatedPos = Math.floor(translation.length * ratio);
    const windowSize = Math.floor(englishPhrase.length * 1.5); // 考虑中文通常比英文短

    return translation.substr(
      Math.max(0, estimatedPos - windowSize / 2),
      windowSize
    );
  }
}

// Initialize cache
const translationCache = new SmartTranslationCache();

// Initialize popup
const popup = new TranslationPopup();

// Check if text is English
function isEnglishText(text) {
  // 移除标点符号和数字
  const cleanText = text.replace(/[0-9.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*]/g, '').trim();
  // 如果清理后没有内容，返回false
  if (!cleanText) return false;
  
  // 检查是否包含中文字符
  if (/[\u4e00-\u9fa5]/.test(cleanText)) return false;
  
  // 检查是否包含英文字母
  if (!/[a-zA-Z]/.test(cleanText)) return false;
  
  // 检查非英文字母的字符比例是否过高（允许20%的其他字符）
  const nonEnglishChars = cleanText.replace(/[a-zA-Z\s]/g, '');
  if (nonEnglishChars.length / cleanText.length > 0.2) return false;
  
  return true;
}

// Handle text selection
document.addEventListener('mouseup', debounce(async (e) => {
  const selectedText = window.getSelection().toString().trim();
  
  // 检查是否为英文文本
  if (selectedText && selectedText.length > 0 && isEnglishText(selectedText)) {
    const x = e.pageX + 10;
    const y = e.pageY + 10;

    // Show popup with loading state
    popup.showLoading();
    popup.show(x, y);

    try {
      // 检查是否有完整匹配的缓存
      if (translationCache.hasExactMatch(selectedText)) {
        const cachedTranslation = translationCache.getExactMatch(selectedText);
        popup.setContent(`<div class="translation-content">${cachedTranslation}</div>`);
        return;
      }

      // 检查是否有可复用的部分
      const { reusable, isFullyCovered } = translationCache.findReusableContent(selectedText);
      
      if (reusable.size > 0) {
        // 显示缓存的翻译结果
        const partialTranslation = Array.from(reusable.values()).join(' ');
        popup.setContent(`<div class="translation-content">${partialTranslation}</div>`);
        
        // 如果内容已被完全覆盖，不需要调用API
        if (isFullyCovered) {
          return;
        }
      }

      // 只有在内容未被完全覆盖时才调用API
      chrome.runtime.sendMessage(
        { action: 'translate', text: selectedText },
        function(response) {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            popup.setContent(`<div class="translation-content">翻译失败: ${chrome.runtime.lastError.message}</div>`);
            return;
          }

          if (response && response.success && response.translation) {
            // 缓存新的翻译结果
            translationCache.cacheTranslation(selectedText, response.translation);
            // 显示完整翻译
            popup.setContent(`<div class="translation-content">${response.translation}</div>`);
          } else {
            const errorMessage = response?.error || '翻译失败，请重试';
            popup.setContent(`<div class="translation-content">${errorMessage}</div>`);
          }
        }
      );
    } catch (error) {
      console.error('Translation error:', error);
      popup.setContent(`<div class="translation-content">翻译出错，请检查扩展设置</div>`);
    }
  } else if (popup.popup.style.display === 'block') {
    const isClickInside = e.composedPath().some(element => {
      return element === popup.popup || element === popup.content;
    });
    if (!isClickInside) {
      popup.hide();
    }
  }
}, 300)); 