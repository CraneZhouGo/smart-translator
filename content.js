// Translation cache
const translationCache = new Map();

// Translation popup class
class TranslationPopup {
  constructor() {
    this.popup = null;
    this.content = null;
    this.progressBar = null;
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
    
    // Create progress bar
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'progress-bar';
    
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
      .translation-stats {
        font-size: 12px;
        color: #666;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #eee;
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
    this.popup.appendChild(this.progressBar);
    shadow.appendChild(style);
    shadow.appendChild(this.popup);
    document.body.appendChild(container);
  }

  setupEventListeners() {
    document.addEventListener('click', (e) => {
      const isClickInside = e.composedPath().some(element => {
        return element === this.popup || element === this.content;
      });

      if (this.popup.style.display === 'block' && !isClickInside) {
        this.hide();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  show(x, y) {
    this.popup.style.display = 'block';
    this.popup.classList.add('fade-in');
    
    const rect = this.popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 10;
    }

    if (y + rect.height > viewportHeight) {
      y = y - rect.height - 10;
    }

    this.popup.style.left = `${x}px`;
    this.popup.style.top = `${y}px`;
  }

  hide() {
    this.popup.style.display = 'none';
  }

  showLoading() {
    this.content.innerHTML = '<div class="spinner"></div>';
  }

  setContent(text, stats = '') {
    this.content.innerHTML = `
      <div class="translation-content">${text}</div>
      ${stats ? `<div class="translation-stats">${stats}</div>` : ''}
    `;
  }
}

// Initialize popup
const popup = new TranslationPopup();

// Check if text is English
function isEnglishText(text) {
  const cleanText = text.replace(/[0-9.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*]/g, '').trim();
  if (!cleanText) return false;
  
  if (/[\u4e00-\u9fa5]/.test(cleanText)) return false;
  
  if (!/[a-zA-Z]/.test(cleanText)) return false;
  
  const nonEnglishChars = cleanText.replace(/[a-zA-Z\s]/g, '');
  if (nonEnglishChars.length / cleanText.length > 0.2) return false;
  
  return true;
}

// Split text by punctuation
function splitByPunctuation(text) {
  // 按标点符号分割文本，保留标点符号
  const segments = text.match(/[^.!?。！？]+[.!?。！？]|[^.!?。！？]+$/g) || [text];
  return segments.map(segment => segment.trim()).filter(segment => segment.length > 0);
}

// Clean text for cache key
function normalizeText(text) {
  return text
    .trim()
    // 移除开头和结尾的标点符号和空格
    .replace(/^[\s.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*。！？]+|[\s.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*。！？]+$/g, '')
    .toLowerCase();
}

// Find best match in cache
function findBestMatch(text, cache) {
  const normalized = normalizeText(text);
  
  // 直接匹配
  if (cache.has(normalized)) {
    return cache.get(normalized);
  }

  // 遍历缓存寻找最佳匹配
  for (const [key, value] of cache.entries()) {
    const normalizedKey = normalizeText(key);
    
    // 完全匹配（忽略大小写和首尾标点空格）
    if (normalized === normalizedKey) {
      return value;
    }

    // 检查是否只是标点符号或空格的差异
    const cleanKey = normalizedKey.replace(/[\s.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*。！？]/g, '');
    const cleanText = normalized.replace(/[\s.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*。！？]/g, '');
    
    if (cleanKey === cleanText) {
      return value;
    }
  }

  return null;
}

// Get cached translations and untranslated segments
function processTextForTranslation(text) {
  const segments = splitByPunctuation(text);
  const cachedTranslations = new Map();
  const untranslatedSegments = [];

  segments.forEach(segment => {
    // 尝试找到最佳匹配的缓存
    const cached = findBestMatch(segment, translationCache);
    if (cached) {
      cachedTranslations.set(normalizeText(segment), cached);
    } else {
      untranslatedSegments.push(segment);
    }
  });

  return {
    cachedTranslations,
    untranslatedSegments
  };
}

// Cache translation segments
function cacheTranslationSegments(segments, translation) {
  const translatedSegments = splitByPunctuation(translation);
  if (segments.length === translatedSegments.length) {
    segments.forEach((segment, index) => {
      // 使用原始文本作为键，这样可以保留原始的标点符号
      translationCache.set(segment.trim(), translatedSegments[index]);
      // 同时保存规范化后的版本
      translationCache.set(normalizeText(segment), translatedSegments[index]);
    });
    return translatedSegments;
  }
  // 如果段落数量不匹配，作为整体缓存
  const fullText = segments.join(' ');
  translationCache.set(fullText.trim(), translation);
  translationCache.set(normalizeText(fullText), translation);
  return [translation];
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
      // 处理文本，获取缓存和未翻译部分
      const { cachedTranslations, untranslatedSegments } = processTextForTranslation(selectedText);
      
      // 计算缓存覆盖率
      const allSegments = splitByPunctuation(selectedText);
      const cachedRatio = ((allSegments.length - untranslatedSegments.length) / allSegments.length) * 100;
      const apiRatio = (100 - cachedRatio).toFixed(1);
      const statsText = `缓存覆盖: ${cachedRatio.toFixed(1)}% | 需要翻译: ${apiRatio}%`;
      
      // 如果所有段落都有缓存，直接显示
      if (untranslatedSegments.length === 0) {
        const translations = allSegments.map(segment => 
          cachedTranslations.get(normalizeText(segment))
        );
        popup.setContent(translations.join(' '), statsText);
        return;
      }

      // 翻译未缓存的部分
      chrome.runtime.sendMessage(
        { action: 'translate', text: untranslatedSegments.join(' ') },
        function(response) {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            popup.setContent('翻译失败: ' + chrome.runtime.lastError.message);
            return;
          }

          if (response && response.success && response.translation) {
            // 缓存新翻译的段落
            const newTranslatedSegments = cacheTranslationSegments(untranslatedSegments, response.translation);
            
            // 按原文顺序重建完整翻译结果
            const finalTranslations = allSegments.map(segment => {
              const normalized = normalizeText(segment);
              // 优先使用缓存的翻译
              if (cachedTranslations.has(normalized)) {
                return cachedTranslations.get(normalized);
              }
              // 如果不在缓存中，从新翻译的结果中获取
              const index = untranslatedSegments.findIndex(s => 
                normalizeText(s) === normalized
              );
              return index !== -1 && index < newTranslatedSegments.length
                ? newTranslatedSegments[index]
                : segment;
            });

            // 显示完整翻译和统计信息
            popup.setContent(finalTranslations.join(' '), statsText);
          } else {
            const errorMessage = response?.error || '翻译失败，请重试';
            popup.setContent(errorMessage);
          }
        }
      );
    } catch (error) {
      console.error('Translation error:', error);
      popup.setContent('翻译出错，请检查扩展设置');
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