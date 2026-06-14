// Bookmarklet — JS source the user drags into their browser bookmarks bar.
// When clicked on a third-party product page, it harvests the rendered DOM
// and the page URL, opens a new Tack tab at `/import`, and posts the data
// via window.postMessage after a `tack:ready` handshake. The whole point is
// to bypass server-side bot defenses (Akamai, DataDome) — the harvest runs
// in the user's own browser, which already passed whatever challenge the
// site mounted.
//
// The generated href stays compact (single javascript:... URL). Two
// constraints: must round-trip through bookmark-bar editors (no real
// newlines in the encoded form), and must minimize attack surface (we only
// read DOM, we never inject anything back into the host page).
//
// Origin is baked in at generation time so the bookmarklet always returns
// to the deployment it was generated from. A dev-generated bookmarklet
// points at localhost; a prod one points at the production origin.
export function buildBookmarklet(tackOrigin: string): string {
  // Strict origin allowlist on both sides — opener and receiver — keeps
  // any future cross-window message handlers from being confused by data
  // crafted by a malicious page. We can't validate the opener's origin
  // (the bookmarklet runs in whatever site the user is on), but the
  // receiver-side handler in ImportScreen explicitly checks message shape.
  const source = `
    (function(){
      var T=${JSON.stringify(tackOrigin)};
      var d={type:'tack:import',url:location.href,html:document.documentElement.outerHTML};
      var w=window.open(T+'/import','tack_import');
      if(!w){alert('Tack: pop-up blocked. Allow pop-ups for '+T+' and try again.');return;}
      var f=function(e){
        if(e.source===w&&e.origin===T&&e.data==='tack:ready'){
          w.postMessage(d,T);
          window.removeEventListener('message',f);
        }
      };
      window.addEventListener('message',f);
    })();
  `;
  // Strip whitespace / newlines so the result fits a one-line javascript: URL.
  // The bookmarklet code has no string literals containing whitespace that
  // we care about (the only ones are JSON-encoded by the IIFE itself), so a
  // naive collapse is safe.
  const minified = source.replace(/\s+/g, ' ').trim();
  return `javascript:${encodeURIComponent(minified)}`;
}
