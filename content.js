// Load config dynamically
let CONFIG = null;

async function loadConfig() {
  try {
    if (!window.TranslatorConfig) {
      throw new Error('Could not find TranslatorConfig in config.js');
    }
    
    CONFIG = window.TranslatorConfig.CONFIG;
    console.log('Config loaded successfully:', CONFIG);
  } catch (error) {
    console.error('Failed to load config:', error);
    throw error;
  }
}

// Translation cache with LRU and expiration
class TranslationCache {
  constructor() {
    this.exact = new Map();
    this.normalized = new Map();
    this.clean = new Map();
    this.timestamps = new Map();
    this.setupCleanup();
  }

  setupCleanup() {
    setInterval(() => this.cleanup(), TranslatorConfig.CONFIG.CACHE.CLEANUP_INTERVAL);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.timestamps) {
      if (now - timestamp > TranslatorConfig.CONFIG.CACHE.EXPIRE_TIME) {
        this.exact.delete(key);
        this.normalized.delete(TextUtils.normalizeText(key));
        this.clean.delete(TextUtils.cleanText(key));
        this.timestamps.delete(key);
      }
    }
  }

  set(text, translation) {
    if (this.timestamps.size >= TranslatorConfig.CONFIG.CACHE.MAX_SIZE) {
      // Remove oldest entry
      const oldestKey = Array.from(this.timestamps.entries())
        .sort(([, a], [, b]) => a - b)[0][0];
      this.delete(oldestKey);
    }

    const normalized = TextUtils.normalizeText(text);
    const clean = TextUtils.cleanText(text);
    const trimmed = text.trim();
    
    this.exact.set(trimmed, translation);
    this.normalized.set(normalized, translation);
    this.clean.set(clean, translation);
    this.timestamps.set(trimmed, Date.now());
  }

  get(text) {
    const trimmed = text.trim();
    
    // Update timestamp on successful get
    const updateTimestamp = (key) => {
      if (this.timestamps.has(key)) {
        this.timestamps.set(key, Date.now());
      }
    };

    // 1. 直接匹配
    if (this.exact.has(trimmed)) {
      updateTimestamp(trimmed);
      return this.exact.get(trimmed);
    }
    
    // 2. 规范化匹配
    const normalized = TextUtils.normalizeText(text);
    if (this.normalized.has(normalized)) {
      const originalKey = Array.from(this.exact.keys())
        .find(key => TextUtils.normalizeText(key) === normalized);
      if (originalKey) {
        updateTimestamp(originalKey);
        return this.normalized.get(normalized);
      }
    }
    
    // 3. 清理后匹配
    const clean = TextUtils.cleanText(text);
    if (this.clean.has(clean)) {
      const originalKey = Array.from(this.exact.keys())
        .find(key => TextUtils.cleanText(key) === clean);
      if (originalKey) {
        updateTimestamp(originalKey);
        return this.clean.get(clean);
      }
    }

    return null;
  }

  delete(key) {
    const normalized = TextUtils.normalizeText(key);
    const clean = TextUtils.cleanText(key);
    
    this.exact.delete(key);
    this.normalized.delete(normalized);
    this.clean.delete(clean);
    this.timestamps.delete(key);
  }

  clear() {
    this.exact.clear();
    this.normalized.clear();
    this.clean.clear();
    this.timestamps.clear();
  }
}

// Initialize cache
const translationCache = new TranslationCache();

// Initialize the extension
async function initializeExtension() {
  try {
    await loadConfig();
    // Continue with the rest of the initialization
    document.addEventListener('mouseup', debounce(handleTextSelection, TranslatorConfig.CONFIG.UI.DEBOUNCE_DELAY));
  } catch (error) {
    console.error('Failed to initialize extension:', error);
  }
}

// Start initialization
initializeExtension();

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
    const container = document.createElement('div');
    container.id = 'quick-translator-container';
    const shadow = container.attachShadow({ mode: 'closed' });

    this.popup = document.createElement('div');
    this.popup.className = 'translation-popup';
    this.content = document.createElement('div');
    this.content.className = 'translation-content';
    
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'progress-bar';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    this.content.appendChild(spinner);

    const style = document.createElement('style');
    style.textContent = `
      .translation-popup {
        position: fixed;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        padding: 16px;
        max-width: ${TranslatorConfig.CONFIG.UI.POPUP_MAX_WIDTH}px;
        z-index: 999999;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: opacity ${TranslatorConfig.CONFIG.UI.FADE_DURATION}ms ease;
        opacity: 0;
      }
      
      .translation-popup.visible {
        opacity: 1;
      }

      .translation-content {
        font-size: 14px;
        line-height: 1.6;
        color: #2c3e50;
        margin-bottom: 8px;
      }

      .translation-stats {
        font-size: 12px;
        color: #7f8c8d;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #ecf0f1;
        display: flex;
        justify-content: space-between;
      }

      .spinner {
        width: 24px;
        height: 24px;
        border: 3px solid #e0e0e0;
        border-top: 3px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 12px auto;
      }

      .progress-bar {
        height: 2px;
        background: #e0e0e0;
        margin-top: 8px;
        border-radius: 1px;
        overflow: hidden;
      }

      .progress-bar::after {
        content: '';
        display: block;
        height: 100%;
        width: 0;
        background: #3498db;
        transition: width 0.3s ease;
      }

      .progress-bar.loading::after {
        width: 100%;
        animation: loading 2s infinite ease-in-out;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      @keyframes loading {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
    `;

    this.popup.appendChild(this.content);
    this.popup.appendChild(this.progressBar);
    shadow.appendChild(style);
    shadow.appendChild(this.popup);
    document.body.appendChild(container);
  }

  setupEventListeners() {
    // Close on outside click
    document.addEventListener('click', (e) => {
      const isClickInside = e.composedPath().some(element => {
        return element === this.popup || element === this.content;
      });

      if (this.popup.style.display === 'block' && !isClickInside) {
        this.hide();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });

    // Handle scroll
    window.addEventListener('scroll', debounce(() => {
      if (this.popup.style.display === 'block') {
        this.updatePosition();
      }
    }, 100));

    // Handle resize
    window.addEventListener('resize', debounce(() => {
      if (this.popup.style.display === 'block') {
        this.updatePosition();
      }
    }, 100));
  }

  updatePosition() {
    const rect = this.popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let { left, top } = this.popup.style;
    left = parseInt(left);
    top = parseInt(top);

    if (left + rect.width > viewportWidth) {
      left = viewportWidth - rect.width - TranslatorConfig.CONFIG.UI.POPUP_OFFSET;
    }

    if (top + rect.height > viewportHeight) {
      top = viewportHeight - rect.height - TranslatorConfig.CONFIG.UI.POPUP_OFFSET;
    }

    this.popup.style.left = `${left}px`;
    this.popup.style.top = `${top}px`;
  }

  show(x, y) {
    this.popup.style.display = 'block';
    this.popup.style.left = `${x + TranslatorConfig.CONFIG.UI.POPUP_OFFSET}px`;
    this.popup.style.top = `${y + TranslatorConfig.CONFIG.UI.POPUP_OFFSET}px`;
    
    requestAnimationFrame(() => {
      this.updatePosition();
      this.popup.classList.add('visible');
    });
  }

  hide() {
    this.popup.classList.remove('visible');
    setTimeout(() => {
      this.popup.style.display = 'none';
    }, TranslatorConfig.CONFIG.UI.FADE_DURATION);
  }

  showLoading() {
    this.content.innerHTML = '<div class="spinner"></div>';
    this.progressBar.classList.add('loading');
  }

  setContent(text, stats = '') {
    this.progressBar.classList.remove('loading');
    this.content.innerHTML = `
      <div class="translation-content">${text}</div>
      ${stats ? `<div class="translation-stats">${stats}</div>` : ''}
    `;
  }
}

// Initialize popup
const popup = new TranslationPopup();

// Text processing utilities
const TextUtils = {
  isEnglishText(text) {
    const cleanText = text.replace(/[0-9.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*]/g, '').trim();
    if (!cleanText || cleanText.length < TranslatorConfig.CONFIG.TRANSLATION.MIN_LENGTH) return false;
    
    // Check for Chinese characters
    if (/[\u4e00-\u9fa5]/.test(cleanText)) return false;
    
    // Must contain English letters
    if (!/[a-zA-Z]/.test(cleanText)) return false;
    
    // Limit non-English character ratio
    const nonEnglishChars = cleanText.replace(/[a-zA-Z\s]/g, '');
    return nonEnglishChars.length / cleanText.length <= 0.2;
  },

  cleanText(text) {
    return text.replace(/[\s.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*。！？]/g, '').toLowerCase();
  },

  normalizeText(text) {
    return text
      .trim()
      .replace(/^[\s.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*。！？]+|[\s.,!?;:'"()\[\]{}\/\\\-_+=<>@#$%^&*。！？]+$/g, '')
      .toLowerCase();
  },

  splitByPunctuation(text) {
    const segments = [];
    let currentSegment = '';
    let i = 0;
    
    while (i < text.length) {
      currentSegment += text[i];
      
      if (/[.!?。！？]/.test(text[i]) || i === text.length - 1) {
        const trimmed = currentSegment.trim();
        if (trimmed && trimmed.length >= TranslatorConfig.CONFIG.TRANSLATION.MIN_LENGTH) {
          segments.push(trimmed);
        }
        currentSegment = '';
      }
      i++;
    }
    
    return segments;
  }
};

// Translation processor
class TranslationProcessor {
  constructor(cache) {
    this.cache = cache;
  }

  processTextForTranslation(text) {
    const segments = TextUtils.splitByPunctuation(text);
    const cachedTranslations = new Map();
    const untranslatedSegments = [];
    
    for (const segment of segments) {
      const cached = this.cache.get(segment);
      if (cached) {
        cachedTranslations.set(TextUtils.normalizeText(segment), cached);
      } else {
        untranslatedSegments.push(segment);
      }
    }
    
    return {
      segments,
      cachedTranslations,
      untranslatedSegments,
      cacheRatio: ((segments.length - untranslatedSegments.length) / segments.length) * 100
    };
  }

  async translateAndCache(untranslatedSegments) {
    try {
      const response = await this.sendTranslationRequest(untranslatedSegments);
      if (!response?.success || !response.translation) {
        throw new Error(response?.error || '翻译失败，请重试');
      }
      
      return this.cacheTranslationSegments(untranslatedSegments, response.translation);
    } catch (error) {
      console.error('Translation error:', error);
      throw error;
    }
  }

  sendTranslationRequest(segments) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { 
          action: 'translate', 
          text: segments.join(' ')
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ 
              success: false, 
              error: chrome.runtime.lastError.message 
            });
            return;
          }
          resolve(response);
        }
      );
    });
  }

  cacheTranslationSegments(segments, translation) {
    const translatedSegments = TextUtils.splitByPunctuation(translation);
    
    if (segments.length === translatedSegments.length) {
      segments.forEach((segment, i) => {
        this.cache.set(segment, translatedSegments[i]);
      });
      return translatedSegments;
    }
    
    const fullText = segments.join(' ');
    this.cache.set(fullText, translation);
    return [translation];
  }

  rebuildTranslation(originalSegments, cachedTranslations, newTranslations, untranslatedSegments) {
    return originalSegments.map(segment => {
      const normalized = TextUtils.normalizeText(segment);
      if (cachedTranslations.has(normalized)) {
        return cachedTranslations.get(normalized);
      }
      
      const index = untranslatedSegments.findIndex(s => 
        TextUtils.normalizeText(s) === normalized
      );
      
      if (index !== -1 && index < newTranslations.length) {
        return newTranslations[index];
      }
      
      return segment;
    }).join(' ');
  }
}

// Initialize processor
const translationProcessor = new TranslationProcessor(translationCache);

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

// Handle text selection
async function handleTextSelection(e) {
  const selectedText = window.getSelection().toString().trim();
  if (!selectedText || !TextUtils.isEnglishText(selectedText)) {
    return;
  }

  const x = e.pageX;
  const y = e.pageY;

  popup.showLoading();
  popup.show(x, y);

  try {
    // Check full text cache first
    const fullTranslation = translationCache.get(selectedText);
    if (fullTranslation) {
      popup.setContent(fullTranslation, '缓存覆盖: 100% | 需要翻译: 0%');
      return;
    }

    // Process text for translation
    const { 
      segments,
      cachedTranslations, 
      untranslatedSegments,
      cacheRatio
    } = translationProcessor.processTextForTranslation(selectedText);

    const statsText = `缓存覆盖: ${cacheRatio.toFixed(1)}% | 需要翻译: ${(100 - cacheRatio).toFixed(1)}%`;

    // If everything is cached
    if (untranslatedSegments.length === 0) {
      const translation = translationProcessor.rebuildTranslation(
        segments, 
        cachedTranslations, 
        [], 
        []
      );
      popup.setContent(translation, statsText);
      return;
    }

    // Translate uncached segments
    const newTranslations = await translationProcessor.translateAndCache(untranslatedSegments);
    
    // Rebuild final translation
    const finalTranslation = translationProcessor.rebuildTranslation(
      segments,
      cachedTranslations,
      newTranslations,
      untranslatedSegments
    );

    popup.setContent(finalTranslation, statsText);

  } catch (error) {
    console.error('Translation error:', error);
    popup.setContent(`翻译出错: ${error.message}`);
  }
} 