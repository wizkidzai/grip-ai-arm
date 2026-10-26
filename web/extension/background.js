// GRIP Focus Helper: answers the GRIP app's questions about distracting tabs.
// It only has access to the sites in sites.js, so Chrome never shows it any other tab.
// It reports only the site NAME (e.g. "YouTube"), never the page or video, and keeps nothing.
import { SITES } from './sites.js';

function siteName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const hit = SITES.find(([, hosts]) => hosts.some((h) => host === h || host.endsWith('.' + h)));
    return hit ? hit[0] : null;
  } catch {
    return null;
  }
}

async function distractingTabs() {
  const tabs = await chrome.tabs.query({}); // only tabs on listed sites come back with a URL
  return tabs
    .map((t) => ({ id: t.id, site: t.url ? siteName(t.url) : null }))
    .filter((t) => t.site);
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Only the GRIP app's own pages (through bridge.js) may ask.
  if (!sender.tab || !msg || typeof msg !== 'object') return;
  if (msg.type === 'check') {
    distractingTabs().then((tabs) => reply({ tabs }));
    return true;
  }
  if (msg.type === 'close' && Number.isInteger(msg.id)) {
    // Close it only if it is still a listed site (never any other tab).
    chrome.tabs
      .get(msg.id)
      .then((t) => (t.url && siteName(t.url) ? chrome.tabs.remove(msg.id).then(() => reply({ closed: true })) : reply({ closed: false })))
      .catch(() => reply({ closed: false }));
    return true;
  }
});
