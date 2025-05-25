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
    this.statsDiv = null;
    this.isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.init();
    this.setupEventListeners();
  }

  init() {
    const container = document.createElement('div');
    container.id = 'quick-translator-container';
    container.style.position = 'fixed';
    container.style.zIndex = '999999';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    const shadow = container.attachShadow({ mode: 'closed' });

    // 创建主容器
    this.popup = document.createElement('div');
    this.popup.className = 'translation-popup';
    this.popup.style.pointerEvents = 'auto';
    this.popup.classList.toggle('dark-mode', this.isDarkMode);

    // 创建固定的头部容器
    const headerContainer = document.createElement('div');
    headerContainer.className = 'header-container';
    
    const header = document.createElement('div');
    header.className = 'popup-header';

    // 添加标题
    const title = document.createElement('div');
    title.className = 'popup-title';
    title.textContent = '智能翻译';
    header.appendChild(title);

    // 添加按钮组
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'button-group';

    // 添加暗黑模式切换按钮
    const themeButton = document.createElement('button');
    themeButton.className = 'theme-button';
    themeButton.innerHTML = `
      <svg class="light-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
      <svg class="dark-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    `;
    themeButton.addEventListener('click', () => this.toggleTheme());
    
    const closeButton = document.createElement('button');
    closeButton.className = 'close-button';
    closeButton.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14">
        <path d="M13 1L1 13M1 1L13 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
    closeButton.addEventListener('click', () => this.hide());
    
    buttonGroup.appendChild(themeButton);
    buttonGroup.appendChild(closeButton);
    header.appendChild(buttonGroup);
    headerContainer.appendChild(header);

    // 创建内容滚动容器
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'scroll-container';

    this.content = document.createElement('div');
    this.content.className = 'translation-content';
    
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'progress-bar';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    this.content.appendChild(spinner);

    // 创建统计信息容器
    this.statsDiv = document.createElement('div');
    this.statsDiv.className = 'translation-stats';

    const style = document.createElement('style');
    style.textContent = `
      .translation-popup {
        position: fixed;
        top: 20px;
        right: 20px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        width: 600px;
        height: auto;
        max-height: calc(100vh - 40px);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: all ${TranslatorConfig.CONFIG.UI.FADE_DURATION}ms ease;
        opacity: 0;
        display: none;
        flex-direction: column;
        overflow: hidden;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.3);
      }

      .translation-popup::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: 
          radial-gradient(circle at 0% 0%, rgba(255, 182, 193, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 100% 0%, rgba(173, 216, 230, 0.15) 0%, transparent 50%),
          radial-gradient(circle at 100% 100%, rgba(152, 251, 152, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 0% 100%, rgba(255, 218, 185, 0.1) 0%, transparent 50%);
        z-index: -1;
        border-radius: 12px;
        opacity: 0.8;
      }

      .dark-mode.translation-popup {
        background: linear-gradient(135deg, rgba(26, 26, 26, 0.95) 0%, rgba(26, 26, 26, 0.98) 100%);
        border: 1px solid rgba(255, 255, 255, 0.05);
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      }

      .dark-mode.translation-popup::before {
        background: 
          radial-gradient(circle at 0% 0%, rgba(138, 43, 226, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 100% 0%, rgba(0, 191, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 100% 100%, rgba(50, 205, 50, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 0% 100%, rgba(255, 140, 0, 0.1) 0%, transparent 50%);
        opacity: 0.4;
      }

      .translation-segment {
        margin-bottom: 16px;
        padding: 16px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.6);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        border: 1px solid rgba(236, 240, 241, 0.3);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        transform-origin: center center;
      }

      .translation-segment:hover {
        transform: translateY(-4px) scale(1.01);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        background: rgba(255, 255, 255, 0.75);
        border-color: rgba(236, 240, 241, 0.5);
      }

      .dark-mode .translation-segment {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.05);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      }

      .dark-mode .translation-segment:hover {
        background: rgba(255, 255, 255, 0.08);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        border-color: rgba(255, 255, 255, 0.1);
      }

      /* 为了让hover效果更加平滑，给前后的段落添加过渡效果 */
      .translation-segment:hover + .translation-segment {
        transform: translateY(2px);
      }

      .translation-segment:last-child {
        margin-bottom: 0;
      }

      .original-text {
        color: #2c3e50;
        font-size: 14px;
        line-height: 1.6;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(236, 240, 241, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      .dark-mode .original-text {
        color: rgba(255, 255, 255, 0.9);
        border-bottom-color: rgba(255, 255, 255, 0.05);
      }

      .translated-text {
        color: #34495e;
        font-size: 14px;
        line-height: 1.6;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      .dark-mode .translated-text {
        color: rgba(255, 255, 255, 0.85);
      }

      .translation-stats {
        position: sticky;
        bottom: 0;
        left: 0;
        right: 0;
        font-size: 12px;
        color: #7f8c8d;
        padding: 10px 20px;
        margin: 0 -20px;
        background: inherit;
        border-top: 1px solid rgba(236, 240, 241, 0.3);
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 1;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      .dark-mode .translation-stats {
        color: rgba(255, 255, 255, 0.6);
        border-top-color: rgba(255, 255, 255, 0.05);
        background: rgba(26, 26, 26, 0.8);
      }

      .translation-stats.translating {
        color: #3498db;
      }

      .translation-stats.translating::after {
        content: '';
        width: 12px;
        height: 12px;
        margin-left: 8px;
        border: 2px solid;
        border-color: #3498db transparent #3498db transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        display: inline-block;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      .dark-mode .translation-stats.translating {
        color: #5dade2;
      }

      .dark-mode .translation-stats.translating::after {
        border-color: #5dade2 transparent #5dade2 transparent;
      }

      .translation-popup {
        background: rgba(255, 255, 255, 0.98);
      }

      .dark-mode.translation-popup {
        background: rgba(26, 26, 26, 0.98);
      }

      .header-container {
        position: sticky;
        top: 0;
        background: inherit;
        border-radius: 12px 12px 0 0;
        z-index: 2;
        padding: 16px 20px;
        flex-shrink: 0;
        border-bottom: 1px solid rgba(236, 240, 241, 0.1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      .dark-mode .header-container {
        border-bottom-color: rgba(255, 255, 255, 0.05);
      }

      .popup-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .popup-title {
        font-size: 16px;
        font-weight: 600;
        color: #2c3e50;
      }

      .dark-mode .popup-title {
        color: #fff;
      }

      .button-group {
        display: flex;
        gap: 8px;
      }

      .theme-button,
      .close-button {
        background: transparent;
        border: none;
        padding: 8px;
        cursor: pointer;
        color: #666;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }

      .dark-mode .theme-button,
      .dark-mode .close-button {
        color: #999;
      }

      .theme-button:hover,
      .close-button:hover {
        background: #f5f5f5;
        color: #333;
      }

      .dark-mode .theme-button:hover,
      .dark-mode .close-button:hover {
        background: #333;
        color: #fff;
      }

      .theme-button:active,
      .close-button:active {
        background: #ebebeb;
      }

      .dark-mode .theme-button:active,
      .dark-mode .close-button:active {
        background: #404040;
      }

      .theme-button .light-icon {
        display: none;
      }

      .theme-button .dark-icon {
        display: block;
      }

      .dark-mode .theme-button .light-icon {
        display: block;
      }

      .dark-mode .theme-button .dark-icon {
        display: none;
      }

      .scroll-container {
        padding: 20px 20px 0 20px;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
        position: relative;
        scrollbar-width: thin;
        scrollbar-color: rgba(155, 155, 155, 0.3) transparent;
      }

      .translation-content {
        padding-bottom: 40px;
      }
    `;

    // 组装DOM结构
    scrollContainer.appendChild(this.content);
    scrollContainer.appendChild(this.statsDiv);
    scrollContainer.appendChild(this.progressBar);
    
    this.popup.appendChild(headerContainer);
    this.popup.appendChild(scrollContainer);
    
    shadow.appendChild(style);
    shadow.appendChild(this.popup);
    document.body.appendChild(container);
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    this.popup.classList.toggle('dark-mode', this.isDarkMode);
  }

  setupEventListeners() {
    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      this.isDarkMode = e.matches;
      this.popup.classList.toggle('dark-mode', this.isDarkMode);
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.popup.style.display !== 'none') {
        this.hide();
      }
    });

    // Handle resize
    window.addEventListener('resize', debounce(() => {
      if (this.popup.style.display !== 'none') {
        this.updateMaxHeight();
      }
    }, 100));

    // 防止点击弹窗内部时触发选择文本事件
    this.popup.addEventListener('mouseup', (e) => {
      e.stopPropagation();
    });
  }

  updateMaxHeight() {
    const windowHeight = window.innerHeight;
    const maxHeight = Math.floor(windowHeight * 0.8);
    this.popup.style.maxHeight = `${maxHeight}px`;
  }

  show() {
    // 重置滚动位置
    if (this.popup.querySelector('.scroll-container')) {
      this.popup.querySelector('.scroll-container').scrollTop = 0;
    }
    
    // 显示弹窗
    this.popup.style.display = 'flex';
    this.popup.style.opacity = '0';
    
    // 强制重排以确保过渡效果生效
    this.popup.offsetHeight;
    
    // 添加可见性并设置不透明度
    requestAnimationFrame(() => {
      this.popup.classList.add('visible');
      this.popup.style.opacity = '1';
    });
    
    this.updateMaxHeight();
  }

  hide() {
    this.popup.classList.remove('visible');
    this.popup.style.opacity = '0';
    
    setTimeout(() => {
      this.popup.style.display = 'none';
    }, TranslatorConfig.CONFIG.UI.FADE_DURATION);
  }

  showLoading() {
    if (this.content) {
      this.content.innerHTML = '<div class="spinner"></div>';
      if (this.progressBar) {
        this.progressBar.classList.add('loading');
      }
      if (this.statsDiv) {
        this.statsDiv.classList.add('translating');
        this.statsDiv.textContent = '正在翻译...';
      }
    }
  }

  setContent(segments, translations, stats = '') {
    if (!this.content || !this.progressBar) return;

    this.progressBar.classList.remove('loading');
    if (this.statsDiv) {
      this.statsDiv.classList.remove('translating');
    }
    
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
    
    // 更新统计信息
    if (stats && this.statsDiv) {
      this.statsDiv.textContent = stats;
      this.statsDiv.style.display = 'flex';
    } else if (this.statsDiv) {
      this.statsDiv.style.display = 'none';
    }

    // 确保内容区域可以滚动
    requestAnimationFrame(() => {
      const scrollContainer = this.popup.querySelector('.scroll-container');
      if (scrollContainer) {
        scrollContainer.style.overflowY = 'auto';
      }
    });
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

  // 检查选中的文本是否在翻译弹窗内
  const isInsidePopup = e.target.closest('#quick-translator-container');
  if (isInsidePopup) {
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