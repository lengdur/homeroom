function showNotification(message, type = 'info') {
  let container = document.getElementById('notificationContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notificationContainer';
    container.setAttribute('aria-live', 'polite');
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:grid;gap:10px;width:min(360px,calc(100vw - 40px));pointer-events:none;';
    document.body.appendChild(container);
  }

  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = 'padding:14px 16px;border-radius:10px;color:#fff;font:600 14px/1.4 Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);pointer-events:auto;opacity:0;transform:translateY(-8px);transition:opacity .2s ease,transform .2s ease;';
  notification.style.background = type === 'error' ? '#b42318' : type === 'success' ? '#18794e' : '#285b68';
  container.appendChild(notification);
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(-8px)';
    setTimeout(() => notification.remove(), 220);
  }, 4000);
}
