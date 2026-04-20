document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn');
  if (btn) {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'startSelection' });
      window.close();
    });
  }
});
