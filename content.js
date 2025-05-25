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
    document.addEventListener('mouseup', debounce(async (e) => {
      try {
        await handleTextSelection(e);
      } catch (error) {
        console.error('Error handling text selection:', error);
      }
    }, TranslatorConfig.CONFIG.UI.DEBOUNCE_DELAY));
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
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        padding: 20px;
        width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        z-index: 999999;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: opacity ${TranslatorConfig.CONFIG.UI.FADE_DURATION}ms ease;
        opacity: 0;
      }
      
      .translation-popup::-webkit-scrollbar {
        width: 8px;
      }
      
      .translation-popup::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 4px;
      }
      
      .translation-popup::-webkit-scrollbar-thumb {
        background: #c1c1c1;
        border-radius: 4px;
      }
      
      .translation-popup::-webkit-scrollbar-thumb:hover {
        background: #a8a8a8;
      }
      
      .translation-popup.visible {
        opacity: 1;
      }

      .translation-content {
        font-size: 14px;
        line-height: 1.6;
        color: #2c3e50;
      }

      .translation-segment {
        margin-bottom: 16px;
        padding-bottom: 16px;
        border-bottom: 1px solid #ecf0f1;
      }

      .translation-segment:last-child {
        border-bottom: none;
        margin-bottom: 0;
        padding-bottom: 0;
      }

      .original-text {
        color: #7f8c8d;
        font-size: 13px;
        margin-bottom: 8px;
        padding: 8px;
        background: #f8f9fa;
        border-radius: 6px;
      }

      .translated-text {
        color: #2c3e50;
        font-size: 15px;
        padding: 0 8px;
      }

      .translation-stats {
        font-size: 12px;
        color: #7f8c8d;
        margin-top: 16px;
        padding-top: 16px;
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
    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });

    // Handle resize
    window.addEventListener('resize', debounce(() => {
      if (this.popup.style.display === 'block') {
        this.updateMaxHeight();
      }
    }, 100));
  }

  updateMaxHeight() {
    const windowHeight = window.innerHeight;
    const maxHeight = Math.floor(windowHeight * 0.8);
    this.popup.style.maxHeight = `${maxHeight}px`;
  }

  show() {
    this.popup.style.display = 'block';
    this.updateMaxHeight();
    requestAnimationFrame(() => {
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

  setContent(segments, translations, stats = '') {
    this.progressBar.classList.remove('loading');
    
    // 清空内容
    this.content.innerHTML = '';
    
    // 添加每个段落的原文和翻译
    segments.forEach((segment, index) => {
      const segmentDiv = document.createElement('div');
      segmentDiv.className = 'translation-segment';
      
      const originalDiv = document.createElement('div');
      originalDiv.className = 'original-text';
      originalDiv.textContent = segment;
      
      const translatedDiv = document.createElement('div');
      translatedDiv.className = 'translated-text';
      translatedDiv.textContent = translations[index] || segment;
      
      segmentDiv.appendChild(originalDiv);
      segmentDiv.appendChild(translatedDiv);
      this.content.appendChild(segmentDiv);
    });
    
    // 添加统计信息
    if (stats) {
      const statsDiv = document.createElement('div');
      statsDiv.className = 'translation-stats';
      statsDiv.textContent = stats;
      this.content.appendChild(statsDiv);
    }
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
    // 首先按句子分割
    const sentences = text.split(/(?<=[.!?。！？])\s+/);
    const segments = [];
    
    for (let sentence of sentences) {
      // 如果句子太长，按逗号等次要标点分割
      if (sentence.length > 200) {
        const subSegments = sentence.split(/(?<=[,;，；])\s+/);
        for (let segment of subSegments) {
          const trimmed = segment.trim();
          if (trimmed && trimmed.length >= TranslatorConfig.CONFIG.TRANSLATION.MIN_LENGTH) {
            segments.push(trimmed);
          }
        }
      } else {
        const trimmed = sentence.trim();
        if (trimmed && trimmed.length >= TranslatorConfig.CONFIG.TRANSLATION.MIN_LENGTH) {
          segments.push(trimmed);
        }
      }
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
    console.log('Original text:', text);
    console.log('Text length:', text.length);
    
    // 预处理文本，移除多余的空白字符
    text = text.replace(/\s+/g, ' ').trim();
    const segments = TextUtils.splitByPunctuation(text);
    
    console.log('Split into segments:', segments);
    console.log('Number of segments:', segments.length);
    
    const cachedTranslations = new Map();
    const untranslatedSegments = [];
    
    // 如果文本太长，分成更小的块
    if (text.length > TranslatorConfig.CONFIG.TRANSLATION.MAX_LENGTH) {
      console.log('Text exceeds maximum length, splitting into smaller chunks');
      const chunks = this.splitIntoChunks(text, TranslatorConfig.CONFIG.TRANSLATION.MAX_LENGTH);
      console.log('Split into chunks:', chunks);
      return {
        segments: chunks,
        cachedTranslations: new Map(),
        untranslatedSegments: chunks,
        cacheRatio: 0
      };
    }
    
    // 如果只有一个段落且长度适中，直接作为整体翻译
    if (segments.length === 1) {
      console.log('Single segment, translating as whole');
      const cached = this.cache.get(text);
      if (cached) {
        console.log('Found in cache:', cached);
        cachedTranslations.set(text, cached);
      } else {
        console.log('Not found in cache, will translate');
        untranslatedSegments.push(text);
      }
      return {
        segments: [text],
        cachedTranslations,
        untranslatedSegments,
        cacheRatio: cached ? 100 : 0
      };
    }
    
    // 处理多个段落的情况
    console.log('Processing multiple segments');
    for (const segment of segments) {
      const cached = this.cache.get(segment);
      if (cached) {
        console.log('Segment found in cache:', { segment, translation: cached });
        cachedTranslations.set(segment, cached);
      } else {
        console.log('Segment needs translation:', segment);
        untranslatedSegments.push(segment);
      }
    }
    
    const cacheRatio = ((segments.length - untranslatedSegments.length) / segments.length) * 100;
    console.log('Translation stats:', {
      totalSegments: segments.length,
      cachedSegments: segments.length - untranslatedSegments.length,
      untranslatedSegments: untranslatedSegments.length,
      cacheRatio
    });
    
    return {
      segments,
      cachedTranslations,
      untranslatedSegments,
      cacheRatio
    };
  }

  // 将文本分割成指定最大长度的块
  splitIntoChunks(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    const sentences = text.split(/(?<=[.!?。！？])\s+/);
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxLength) {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        // 如果单个句子超过最大长度，需要进一步分割
        if (sentence.length > maxLength) {
          const subChunks = sentence.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [];
          chunks.push(...subChunks);
        } else {
          currentChunk = sentence;
        }
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  async translateAndCache(untranslatedSegments) {
    try {
      console.log('Starting translation for segments:', untranslatedSegments);
      const translations = [];
      
      // 一次翻译一个段落，确保顺序正确
      for (let i = 0; i < untranslatedSegments.length; i++) {
        const segment = untranslatedSegments[i];
        console.log(`Translating segment ${i + 1}/${untranslatedSegments.length}:`, segment);
        
        const response = await this.sendTranslationRequest([segment]);
        if (!response?.success || !response.translation) {
          throw new Error(response?.error || '翻译失败，请重试');
        }
        
        console.log('Translation result:', response.translation);
        this.cache.set(segment, response.translation);
        translations.push(response.translation);
        
        // 添加短暂延迟
        if (i < untranslatedSegments.length - 1) {
          console.log('Waiting before next segment...');
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      console.log('All translations completed:', translations);
      return translations;
    } catch (error) {
      console.error('Translation error:', error);
      throw error;
    }
  }

  sendTranslationRequest(segments) {
    const text = segments.join('\n');
    console.log('Sending translation request for text:', text);
    console.log('Text length:', text.length);
    
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { 
          action: 'translate', 
          text: text
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Translation request failed:', chrome.runtime.lastError);
            resolve({ 
              success: false, 
              error: chrome.runtime.lastError.message 
            });
            return;
          }
          console.log('Translation response received:', response);
          resolve(response);
        }
      );
    });
  }

  async rebuildTranslation(originalSegments, cachedTranslations, newTranslations, untranslatedSegments) {
    console.log('Rebuilding translation from parts:', {
      originalSegments,
      cachedTranslations: Array.from(cachedTranslations.entries()),
      newTranslations,
      untranslatedSegments
    });
    
    const translatedParts = [];
    let newTranslationIndex = 0;
    
    for (const segment of originalSegments) {
      console.log('Processing segment:', segment);
      
      // 首先检查缓存
      if (cachedTranslations.has(segment)) {
        const translation = cachedTranslations.get(segment);
        console.log('Found in cache:', translation);
        translatedParts.push(translation);
        continue;
      }
      
      // 然后检查新翻译
      const untranslatedIndex = untranslatedSegments.indexOf(segment);
      if (untranslatedIndex !== -1 && newTranslationIndex < newTranslations.length) {
        const translation = newTranslations[newTranslationIndex++];
        console.log('Using new translation:', translation);
        translatedParts.push(translation);
        continue;
      }
      
      // 如果都没有找到，记录警告并继续尝试翻译
      console.warn('Missing translation for segment, retrying:', segment);
      try {
        const response = await this.sendTranslationRequest([segment]);
        if (response?.success && response.translation) {
          console.log('Retry translation successful:', response.translation);
          this.cache.set(segment, response.translation);
          translatedParts.push(response.translation);
        } else {
          console.warn('Retry failed, using original text');
          translatedParts.push(segment);
        }
      } catch (error) {
        console.error('Retry translation failed:', error);
        translatedParts.push(segment);
      }
    }
    
    // 移除空的翻译结果
    const filteredParts = translatedParts.filter(part => part && part.trim());
    console.log('Filtered translation parts:', filteredParts);
    
    // 如果没有任何翻译结果，返回原文
    if (filteredParts.length === 0) {
      console.warn('No valid translations found, returning original text');
      return originalSegments.join('\n');
    }
    
    const finalTranslation = filteredParts.join('\n');
    console.log('Final translation:', finalTranslation);
    return finalTranslation;
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

  popup.showLoading();
  popup.show();

  try {
    // Check full text cache first
    const fullTranslation = translationCache.get(selectedText);
    if (fullTranslation) {
      const segments = [selectedText];
      const translations = [fullTranslation];
      popup.setContent(segments, translations, '缓存覆盖: 100% | 需要翻译: 0%');
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
      const translations = segments.map(segment => cachedTranslations.get(segment));
      popup.setContent(segments, translations, statsText);
      return;
    }

    // Translate uncached segments
    const newTranslations = await translationProcessor.translateAndCache(untranslatedSegments);
    
    // Rebuild final translation with segments
    const translations = segments.map(segment => {
      if (cachedTranslations.has(segment)) {
        return cachedTranslations.get(segment);
      }
      const index = untranslatedSegments.indexOf(segment);
      return index !== -1 ? newTranslations[index] : segment;
    });

    popup.setContent(segments, translations, statsText);

  } catch (error) {
    console.error('Translation error:', error);
    popup.setContent([selectedText], [`翻译出错: ${error.message}`]);
  }
} 