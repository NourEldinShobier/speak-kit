/**
 * The script a development page includes to report clicks, console errors and failed requests to the local server:
 * `<script src="http://127.0.0.1:PORT/v1/capture/page-context/sdk.js" data-token="TOKEN"></script>`.
 * It reports names only (a button's text, a tag, a path of tags), never what is typed, and it never reports its own requests.
 * It is plain browser code kept as text, so it runs as it is written here.
 */
export const PAGE_SDK_SOURCE = String.raw`(function (w, d) {
  var script = d.currentScript;
  var token = script && script.getAttribute("data-token");
  if (!script || !script.src || !token || w.__speakkitPage) return;
  w.__speakkitPage = true;
  var url = new URL(script.src).origin + "/v1/capture/page-context";
  var send = w.fetch.bind(w);
  var queue = [];
  var timer;
  function flush() {
    timer = undefined;
    var events = queue.splice(0, 50);
    if (!events.length) return;
    send(url, {
      method: "POST",
      keepalive: true,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ page: { url: String(w.location.href).slice(0, 2048), title: String(d.title).slice(0, 80) }, events: events }),
    }).catch(function () {
      /* a report that did not arrive is not worth an error in the page being built */
    });
    if (queue.length) timer = w.setTimeout(flush, 1000);
  }
  function add(e) {
    if (queue.length < 200) queue.push(e);
    if (timer === undefined) timer = w.setTimeout(flush, 1000);
  }
  function tagOf(el) {
    var t = String(el.tagName).toLowerCase().slice(0, 32);
    return /^[a-z][a-z0-9-]*$/.test(t) ? t : "element";
  }
  function part(el) {
    return tagOf(el) + (el.id ? "#" + String(el.id).slice(0, 30) : "");
  }
  function pathOf(el) {
    var parts = [];
    for (var n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) parts.unshift(part(n));
    return parts.join(" > ").slice(0, 160);
  }
  var TEXT_ROLES = /^(button|link|tab|menuitem|menuitemcheckbox|menuitemradio|option|checkbox|radio|switch|treeitem)$/;
  var TEXT_TAGS = /^(button|a|summary|label)$/;
  var FIELD = '[contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]';
  /* A name for what was clicked, never what is typed: fields (also rich text editors) have none, and a container (a dialog, the page body) is named by its aria-label only. */
  function labelOf(el, tag, role) {
    if (tag === "input" || tag === "textarea" || tag === "select" || (el.closest && el.closest(FIELD))) return "";
    var own = role ? TEXT_ROLES.test(role) : TEXT_TAGS.test(tag);
    return String(el.getAttribute("aria-label") || (own && el.textContent) || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }
  function clicked(ev) {
    var target = ev.target;
    var el = (target && target.closest && target.closest("button, a, [role], input, select, textarea, summary, label")) || target;
    if (!el || el.nodeType !== 1) return;
    var tag = tagOf(el);
    var role = el.getAttribute("role");
    var label = labelOf(el, tag, role);
    var element = { tag: tag, path: pathOf(el) };
    if (role) element.role = String(role).slice(0, 32);
    if (label) element.label = label;
    add({ type: "click", at: Date.now(), element: element });
  }
  function fail(message) {
    add({ type: "console-error", at: Date.now(), message: String(message).slice(0, 400) });
  }
  d.addEventListener("click", clicked, true);
  w.addEventListener("error", function (e) { fail(e.message); });
  w.addEventListener("unhandledrejection", function (e) { fail(e.reason); });
  var consoleError = w.console.error.bind(w.console);
  w.console.error = function () {
    var args = Array.prototype.slice.call(arguments);
    fail(args.map(String).join(" "));
    consoleError.apply(null, args);
  };
  w.fetch = function (input, init) {
    var target = String((input && input.url) || input).slice(0, 2048);
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    function report(status) {
      if (/^[A-Z]{3,7}$/.test(method) && target.indexOf(url) !== 0) add({ type: "failed-request", at: Date.now(), method: method, url: target, status: status });
    }
    return send(input, init).then(
      function (res) {
        if (res.status >= 400) report(res.status);
        return res;
      },
      function (e) {
        report(0);
        throw e;
      }
    );
  };
})(window, document);
`;
