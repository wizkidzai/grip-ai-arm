// Runs only on the GRIP app's pages. Passes messages between the page and the extension.
(() => {
  const post = (data) => window.postMessage({ from: 'grip-focus-helper', ...data }, window.location.origin);
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.from !== 'grip-app') return;
    const { type, id, req } = e.data;
    if (type === 'ping') return post({ type: 'pong', req });
    if (type === 'check' || type === 'close') {
      chrome.runtime.sendMessage({ type, id }, (res) => post({ type: `${type}-result`, req, ...(res || {}) }));
    }
  });
  post({ type: 'pong' });
})();
