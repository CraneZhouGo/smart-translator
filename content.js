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

// Translation cache
const translationCache = new Map();

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

    // Check cache first
    const cachedTranslation = translationCache.get(selectedText);
    if (cachedTranslation) {
      popup.setContent(`<div class="translation-content">${cachedTranslation}</div>`);
      return;
    }

    try {
      // 发送消息到background script
      chrome.runtime.sendMessage(
        { action: 'translate', text: selectedText },
        function(response) {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            popup.setContent(`<div class="translation-content">翻译失败: ${chrome.runtime.lastError.message}</div>`);
            return;
          }

          if (response && response.success && response.translation) {
            // Cache the translation
            translationCache.set(selectedText, response.translation);
            // 显示翻译结果
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
    // 如果选中的文本不是英文，且弹窗正在显示，则检查点击是否在弹窗外
    const isClickInside = e.composedPath().some(element => {
      return element === popup.popup || element === popup.content;
    });
    if (!isClickInside) {
      popup.hide();
    }
  }
}, 300)); 