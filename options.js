// Load saved API key when options page is opened
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['apiKey'], (result) => {
    document.getElementById('apiKey').value = result.apiKey || '';
  });
});

// Save API key when save button is clicked
document.getElementById('save').addEventListener('click', () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  const status = document.getElementById('status');
  
  if (!apiKey) {
    showStatus('Please enter your API key.', 'error');
    return;
  }

  chrome.storage.sync.set({ apiKey }, () => {
    if (chrome.runtime.lastError) {
      showStatus('Error saving settings. Please try again.', 'error');
    } else {
      showStatus('Settings saved successfully!', 'success');
    }
  });
});

// Show status message
function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  status.style.display = 'block';
  
  // Hide status after 3 seconds
  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
} 