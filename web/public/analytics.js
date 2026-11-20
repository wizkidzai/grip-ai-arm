// Website analytics with GoatCounter (site "wizkidz-grip-ai-arm"). No cookies, and only the
// page's address is sent. See the privacy policy.
window.goatcounter = { no_onload: true };   // we count each page ourselves, below
function countPage() {
  const visit = { path: location.pathname + location.hash, title: document.title };
  let tries = 0;   // GoatCounter's script loads in the background, so wait for it (up to 10 s)
  const send = () => {
    if (window.goatcounter.count) window.goatcounter.count(visit);
    else if (++tries < 50) setTimeout(send, 200);
  };
  send();
}
countPage();
window.addEventListener("hashchange", countPage);   // for sites with screens like #home, #map
