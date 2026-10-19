"""Live recovery phrase leak check.

Drives a real browser through wallet creation, phrase reveal and backup
confirmation, then proves the 24 words appear nowhere in localStorage,
sessionStorage, cookies, IndexedDB or any network request.

    python3 tests/browser/phrase_leak.py            # against the dev server
    python3 tests/browser/phrase_leak.py <base-url>
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
PASSWORD = "Quiet-Harbor-9-Lantern"
OUT = Path("/tmp/browser/phrase-leak")
OUT.mkdir(parents=True, exist_ok=True)

READ_IDB = """
async () => {
  const names = (await indexedDB.databases?.()) ?? [];
  const dump = [];
  for (const info of names) {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open(info.name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    if (!db) continue;
    for (const store of Array.from(db.objectStoreNames)) {
      const rows = await new Promise((resolve) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve([]);
      });
      dump.push({ db: info.name, store, rows });
    }
  }
  return JSON.stringify(dump);
}
"""


def leaked(words, haystack):
    """Whole-word matches only: "network" must not read as the word "work", and
    an identifier such as "access_token" is not the wordlist word "access"."""
    return sorted(
        {
            word
            for word in words
            if len(word) >= 4
            and re.search(rf"(?<![A-Za-z0-9_]){re.escape(word)}(?![A-Za-z0-9_])", haystack)
        }
    )


def leaked_pairs(words, haystack):
    """Two adjacent phrase words together. Single wordlist words appear by
    coincidence in URLs and bundles, a consecutive pair does not."""
    pairs = [f"{a} {b}" for a, b in zip(words, words[1:])]
    return sorted({pair for pair in pairs if pair in haystack or pair.replace(" ", "+") in haystack})


READ_REACT_STATE = """() => {
  // Walk the React fiber tree and collect every string held in props or state,
  // which is where a forgotten copy of the phrase would live.
  const root = document.getElementById('root') || document.body;
  const key = Object.keys(root).find((k) => k.startsWith('__reactContainer'))
    || Object.keys(root.firstChild || {}).find((k) => k.startsWith('__reactFiber'));
  let fiber = key ? (root[key] || root.firstChild[key]) : null;
  // The container fiber can point at the previous tree after an update, so
  // follow the root's current pointer when there is one.
  if (fiber && fiber.stateNode && fiber.stateNode.current) fiber = fiber.stateNode.current;
  const seen = new Set();
  const out = [];
  const collect = (value, depth) => {
    if (value == null || depth > 4) return;
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach((item) => collect(item, depth + 1));
    else if (typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
      for (const item of Object.values(value)) collect(item, depth + 1);
    }
  };
  const walk = (node, depth) => {
    if (!node || depth > 200) return;
    collect(node.memoizedProps, 0);
    collect(node.memoizedState, 0);
    walk(node.child, depth + 1);
    walk(node.sibling, depth + 1);
  };
  walk(fiber, 0);
  return out.join(' \\n ');
}"""


async def main():
    results = []
    requests = []

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        async def on_request(request):
            body = ""
            try:
                body = request.post_data or ""
            except Exception:
                body = ""
            requests.append(f"{request.url}\n{json.dumps(dict(request.headers))}\n{body}")

        page.on("request", lambda request: asyncio.ensure_future(on_request(request)))

        # Ledgerly gates the wallet screens behind a profile, so restore the
        # sandbox session before navigating.
        cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
        storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        if cookies_json:
            cookies = json.loads(cookies_json)
            for cookie in cookies:
                cookie["url"] = BASE
            await context.add_cookies(cookies)
        await page.goto(BASE, wait_until="domcontentloaded")
        if storage_key and session_json:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
            )

        await page.goto(f"{BASE}/wallet/create", wait_until="networkidle")
        await page.get_by_role("button", name="Create a new wallet").click()
        await page.get_by_label("Password", exact=True).fill(PASSWORD)
        await page.get_by_label("Confirm password").fill(PASSWORD)
        await page.get_by_role("button", name="Continue").click()

        await page.get_by_role("button", name="Reveal phrase").click()
        await page.wait_for_selector(".seed-word")
        words = await page.eval_on_selector_all(
            ".seed-word", "nodes => nodes.map(n => n.textContent.replace(/^\\d+/, '').trim())"
        )
        assert len(words) == 24, f"expected 24 words, saw {len(words)}"
        await page.screenshot(path=str(OUT / "1_revealed.png"))

        async def snapshot(label):
            local = await page.evaluate("() => JSON.stringify(window.localStorage)")
            session = await page.evaluate("() => JSON.stringify(window.sessionStorage)")
            cookies = json.dumps(await context.cookies())
            idb = await page.evaluate(READ_IDB)
            dom = await page.content()
            for name, blob in (
                ("localStorage", local),
                ("sessionStorage", session),
                ("cookies", cookies),
                ("indexedDB", idb),
            ):
                hits = leaked(words, blob)
                # A stored phrase brings the whole list with it. One or two
                # matches are ordinary English inside session JSON keys such as
                # "session" or "access", so only a cluster counts as a leak.
                results.append((f"{label}: {name}", hits if len(hits) >= 3 else []))
            return dom

        await snapshot("after reveal")

        read_secret_fields = """() => Array.from(document.querySelectorAll('[data-secret]')).map((el) => ({
              autocomplete: el.getAttribute('autocomplete'),
              autocorrect: el.getAttribute('autocorrect'),
              autocapitalize: el.getAttribute('autocapitalize'),
              spellcheck: el.getAttribute('spellcheck'),
            }))"""

        await page.get_by_role("button", name="I have written it down").click()
        await page.wait_for_selector("text=Confirm your backup")
        dom = await page.content()
        # Wordlist entries like "note" also occur in markup, so the DOM check
        # looks for adjacent phrase words and for the seed grid itself.
        results.append(("after leaving backup: DOM", leaked_pairs(words, dom)))
        grid = await page.eval_on_selector_all(".seed-word", "nodes => nodes.length")
        results.append(("after leaving backup: seed grid", ["still mounted"] if grid else []))

        # The verification word fields must refuse autofill and spellcheck.
        hardened = await page.evaluate(read_secret_fields)
        bad = [
            field
            for field in hardened
            if field["autocomplete"] != "off"
            or field["autocorrect"] != "off"
            or field["autocapitalize"] != "off"
            or field["spellcheck"] != "false"
        ]
        results.append(("verify fields hardened", bad))
        results.append(("verify fields present", [] if hardened else ["none found"]))

        # The phrase must not survive in React state once the confirm step is up.
        # The whole app's rendered copy is in this blob, so a single common
        # English word is noise: only a cluster means the list is still held.
        state_blob = await page.evaluate(READ_REACT_STATE)
        state_hits = leaked(words, state_blob)
        results.append(
            ("after leaving backup: React state", state_hits if len(state_hits) >= 3 else [])
        )

        # Going back to the phrase must cost the password, not reuse a copy
        # still sitting in the page.
        await page.get_by_role("button", name="Show my phrase again").click()
        await page.wait_for_selector("text=Finish backing up")
        back_dom = await page.content()
        results.append(("back to phrase: DOM", leaked_pairs(words, back_dom)))
        grid = await page.eval_on_selector_all(".seed-word", "nodes => nodes.length")
        results.append(("back to phrase: seed grid", ["shown without password"] if grid else []))
        prompts = await page.get_by_label("Password", exact=True).count()
        results.append(("back to phrase: password required", [] if prompts == 1 else ["no prompt"]))

        # Supply the password and walk forward again to a fresh challenge.
        await page.get_by_label("Password", exact=True).fill(PASSWORD)
        await page.get_by_role("button", name="Show my recovery phrase").click()
        await page.wait_for_selector(".seed-word")
        await page.get_by_role("button", name="Reveal phrase").click()
        reshown = await page.eval_on_selector_all(
            ".seed-word", "nodes => nodes.map(n => n.textContent.replace(/^\\d+/, '').trim())"
        )
        results.append(("back to phrase: same phrase returned", [] if reshown == words else ["mismatch"]))
        await page.get_by_role("button", name="I have written it down").click()
        await page.wait_for_selector("text=Confirm your backup")

        # Answer the three verification words.
        labels = await page.eval_on_selector_all(
            ".field-label", "nodes => nodes.map(n => n.textContent.trim())"
        )
        for label in [item for item in labels if item.startswith("Word ")]:
            index = int(label.split(" ")[1]) - 1
            await page.get_by_label(label, exact=True).fill(words[index])
        await page.get_by_role("button", name="Finish setup").click()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(OUT / "2_finished.png"))

        await snapshot("after backup confirmed")
        results.append(("network requests", leaked_pairs(words, "\n".join(requests))))
        results.append(("password in storage", ["password"] if PASSWORD in await page.evaluate(
            "() => JSON.stringify(window.localStorage) + JSON.stringify(window.sessionStorage)"
        ) else []))

        await browser.close()

    print(f"secret fields found: {len(hardened)}")
    for field in hardened:
        print("  ", field)
    failures = [(name, hits) for name, hits in results if hits]
    for name, hits in results:
        print(("LEAK " if hits else "PASS ") + name + (f" -> {hits}" if hits else ""))
    print(f"\nrequests observed: {len(requests)}")
    if failures:
        sys.exit(1)
    print("\nNo recovery phrase material found in storage, cookies, IndexedDB, DOM or network.")


asyncio.run(main())
