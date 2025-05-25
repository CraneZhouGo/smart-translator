// Translation cache with quick lookup maps
const translationCache = {
  exact: new Map(), // 精确匹配缓存
  normalized: new Map(), // 规范化后的缓存
  clean: new Map(), // 清理所有标点后的缓存
  
  // 设置缓存，同时更新所有Map
  set(text, translation) {
    const normalized = normalizeText(text);
    const clean = cleanText(text);
    
    this.exact.set(text.trim(), translation);
    this.normalized.set(normalized, translation);
    this.clean.set(clean, translation);
  },
  
  // 快速查找匹配
  get(text) {
    const trimmed = text.trim();
    // 1. 直接匹配
    if (this.exact.has(trimmed)) {
      return this.exact.get(trimmed);
    }
    
    // 2. 规范化匹配
    const normalized = normalizeText(text);
    if (this.normalized.has(normalized)) {
      return this.normalized.get(normalized);
    }
    
    // 3. 清理后匹配
    const clean = cleanText(text);
    return this.clean.get(clean);
  }
};

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

// 清理所有标点和空格，用于模糊匹配
function cleanText(text) {
  return text.replace(/[\s.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*。！？]/g, '').toLowerCase();
}

// 规范化文本，保留句子间标点
function normalizeText(text) {
  return text
    .trim()
    .replace(/^[\s.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*。！？]+|[\s.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*。！？]+$/g, '')
    .toLowerCase();
}

// 优化的文本分割函数
function splitByPunctuation(text) {
  // 预先分配足够大的数组以避免扩容
  const segments = [];
  let currentSegment = '';
  let i = 0;
  
  while (i < text.length) {
    currentSegment += text[i];
    
    // 检查是否遇到句子结束标记
    if (/[.!?。！？]/.test(text[i]) || i === text.length - 1) {
      if (currentSegment.trim()) {
        segments.push(currentSegment.trim());
      }
      currentSegment = '';
    }
    i++;
  }
  
  return segments;
}

// 优化的翻译处理函数
function processTextForTranslation(text) {
  const segments = splitByPunctuation(text);
  const cachedTranslations = new Map();
  const untranslatedSegments = [];
  
  // 预先计算段落数量以优化数组分配
  const segmentCount = segments.length;
  untranslatedSegments.length = segmentCount;
  
  let untranslatedCount = 0;
  
  // 单次遍历处理所有段落
  for (let i = 0; i < segmentCount; i++) {
    const segment = segments[i];
    const cached = translationCache.get(segment);
    
    if (cached) {
      cachedTranslations.set(normalizeText(segment), cached);
    } else {
      untranslatedSegments[untranslatedCount++] = segment;
    }
  }
  
  // 截断未使用的空间
  untranslatedSegments.length = untranslatedCount;
  
  return {
    cachedTranslations,
    untranslatedSegments
  };
}

// 优化的缓存存储函数
function cacheTranslationSegments(segments, translation) {
  const translatedSegments = splitByPunctuation(translation);
  
  if (segments.length === translatedSegments.length) {
    // 批量缓存所有段落
    for (let i = 0; i < segments.length; i++) {
      translationCache.set(segments[i], translatedSegments[i]);
    }
    return translatedSegments;
  }
  
  // 整体缓存
  const fullText = segments.join(' ');
  translationCache.set(fullText, translation);
  return [translation];
}

// Handle text selection
document.addEventListener('mouseup', debounce(async (e) => {
  const selectedText = window.getSelection().toString().trim();
  
  // 快速检查是否需要处理
  if (!selectedText || selectedText.length === 0 || !isEnglishText(selectedText)) {
    return;
  }

  const x = e.pageX + 10;
  const y = e.pageY + 10;

  // Show popup with loading state
  popup.showLoading();
  popup.show(x, y);

  try {
    // 检查完整文本是否有缓存
    const fullTranslation = translationCache.get(selectedText);
    if (fullTranslation) {
      popup.setContent(fullTranslation, '缓存覆盖: 100% | 需要翻译: 0%');
      return;
    }

    // 处理文本，获取缓存和未翻译部分
    const { cachedTranslations, untranslatedSegments } = processTextForTranslation(selectedText);
    
    // 计算缓存覆盖率
    const totalSegments = splitByPunctuation(selectedText).length;
    const cachedRatio = ((totalSegments - untranslatedSegments.length) / totalSegments) * 100;
    const apiRatio = (100 - cachedRatio).toFixed(1);
    const statsText = `缓存覆盖: ${cachedRatio.toFixed(1)}% | 需要翻译: ${apiRatio}%`;
    
    // 如果所有段落都有缓存，直接显示
    if (untranslatedSegments.length === 0) {
      const translations = [];
      splitByPunctuation(selectedText).forEach(segment => {
        translations.push(cachedTranslations.get(normalizeText(segment)));
      });
      popup.setContent(translations.join(' '), statsText);
      return;
    }

    // 翻译未缓存的部分
    chrome.runtime.sendMessage(
      { 
        action: 'translate', 
        text: untranslatedSegments.join(' ')
      },
      function(response) {
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          popup.setContent('翻译失败: ' + chrome.runtime.lastError.message);
          return;
        }

        if (response?.success && response.translation) {
          const newTranslatedSegments = cacheTranslationSegments(untranslatedSegments, response.translation);
          
          // 重建翻译结果
          const finalTranslations = [];
          splitByPunctuation(selectedText).forEach(segment => {
            const normalized = normalizeText(segment);
            if (cachedTranslations.has(normalized)) {
              finalTranslations.push(cachedTranslations.get(normalized));
            } else {
              const index = untranslatedSegments.findIndex(s => normalizeText(s) === normalized);
              if (index !== -1 && index < newTranslatedSegments.length) {
                finalTranslations.push(newTranslatedSegments[index]);
              } else {
                finalTranslations.push(segment);
              }
            }
          });

          popup.setContent(finalTranslations.join(' '), statsText);
        } else {
          popup.setContent(response?.error || '翻译失败，请重试');
        }
      }
    );
  } catch (error) {
    console.error('Translation error:', error);
    popup.setContent('翻译出错，请检查扩展设置');
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