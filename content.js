// Translation cache
const translationCache = new Map();

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

  setContent(text) {
    this.content.innerHTML = text;
  }

  showLoading() {
    this.content.innerHTML = '<div class="spinner"></div>';
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
  return text.trim().toLowerCase();
}

// Get cached translations and untranslated segments
function processTextForTranslation(text) {
  const segments = splitByPunctuation(text);
  const cachedTranslations = new Map();
  const untranslatedSegments = [];

  segments.forEach(segment => {
    const normalized = normalizeText(segment);
    const cached = translationCache.get(normalized);
    if (cached) {
      cachedTranslations.set(normalized, cached);
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
      translationCache.set(normalizeText(segment), translatedSegments[index]);
    });
    return translatedSegments;
  }
  // 如果段落数量不匹配，作为整体缓存
  const fullText = segments.join(' ');
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
      
      // 如果所有段落都有缓存，直接显示
      if (untranslatedSegments.length === 0) {
        const allSegments = splitByPunctuation(selectedText);
        const translations = allSegments.map(segment => 
          cachedTranslations.get(normalizeText(segment))
        );
        popup.setContent(`<div class="translation-content">${translations.join(' ')}</div>`);
        return;
      }

      // 翻译未缓存的部分
      chrome.runtime.sendMessage(
        { action: 'translate', text: untranslatedSegments.join(' ') },
        function(response) {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            popup.setContent(`<div class="translation-content">翻译失败: ${chrome.runtime.lastError.message}</div>`);
            return;
          }

          if (response && response.success && response.translation) {
            // 缓存新翻译的段落
            const newTranslatedSegments = cacheTranslationSegments(untranslatedSegments, response.translation);
            
            // 按原文顺序重建完整翻译结果
            const allSegments = splitByPunctuation(selectedText);
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

            // 显示完整翻译
            const finalTranslation = finalTranslations.join(' ');
            popup.setContent(`<div class="translation-content">${finalTranslation}</div>`);
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