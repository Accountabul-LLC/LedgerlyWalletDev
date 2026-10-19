"""Exercise shared dialog typing in Chromium, without a wallet or backend.

Run from the repository root: python3 tests/browser/dialog_focus.py
Requires npm dependencies and Python Playwright with Chromium installed.
"""

import asyncio
from pathlib import Path
import subprocess
import tempfile

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]


async def check(bundle):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        async def mount(autofocus=False):
            await page.goto("about:blank")
            await page.set_content('<div id="root"></div>')
            if autofocus:
                # A real HTTP origin lets the harness read its mount option.
                await page.route("http://dialog.test/**", lambda route: route.fulfill(
                    body='<div id="root"></div>', content_type="text/html"))
                await page.goto("http://dialog.test/?autofocus")
            await page.add_script_tag(path=str(bundle))
            await expect(page.get_by_role("dialog")).to_be_visible()

        await mount()
        await expect(page.get_by_role("dialog")).to_be_focused()
        name = page.get_by_label("Name", exact=True)
        await name.click()
        sentence = "Separate wallet for everyday payments"
        await name.press_sequentially(sentence, delay=10)
        await expect(name).to_have_value(sentence)
        await expect(name).to_be_focused()

        # An edit in the middle must retain the caret and selection too.
        await name.evaluate("el => el.setSelectionRange(9, 15)")
        await page.keyboard.type("account")
        await expect(name).to_have_value("Separate account for everyday payments")
        assert await name.evaluate("el => el.selectionStart") == 16
        await page.keyboard.press("ArrowLeft")
        await page.keyboard.press("Backspace")
        await expect(name).to_have_value("Separate accout for everyday payments")

        notes = page.get_by_label("Notes")
        await notes.click()
        await notes.press_sequentially("First line\nSecond line", delay=10)
        await expect(notes).to_have_value("First line\nSecond line")
        await expect(notes).to_be_focused()
        password = page.get_by_label("Password")
        await password.click()
        await password.press_sequentially("Regression-test-password", delay=10)
        await expect(password).to_have_value("Regression-test-password")
        await expect(password).to_be_focused()
        await page.keyboard.press("Tab")
        network = page.get_by_label("Network")
        await expect(network).to_be_focused()
        await network.select_option("main")
        await expect(network).to_be_focused()

        # Escape must use the current callback, including the edited name.
        await page.keyboard.press("Escape")
        await expect(page.get_by_role("dialog")).to_have_count(0)
        await expect(page.get_by_test_id("closed-with")).to_have_text(
            "Separate accout for everyday payments")
        await page.get_by_role("button", name="Open dialog").click()
        await expect(page.get_by_role("dialog")).to_be_focused()
        await page.get_by_role("button", name="Close", exact=True).click()
        await expect(page.get_by_role("dialog")).to_have_count(0)
        await page.get_by_role("button", name="Open dialog").click()
        await page.locator(".backdrop").dispatch_event("mousedown")
        await expect(page.get_by_role("dialog")).to_have_count(0)

        await mount(autofocus=True)
        await expect(page.get_by_label("Name", exact=True)).to_be_focused()
        assert not errors, errors
        await browser.close()
        print("PASS: typing, caret, selection, multiline, password, Tab, latest Escape callback, reopen, close, backdrop, autofocus")


with tempfile.TemporaryDirectory(prefix="ledgerly-dialog-focus-") as temporary:
    bundle = Path(temporary) / "harness.js"
    subprocess.run([
        str(ROOT / "node_modules/.bin/esbuild"),
        "tests/browser/fixtures/dialog-focus.tsx", "--bundle", "--format=iife",
        "--loader:.png=dataurl",
        f"--outfile={bundle}",
    ], cwd=ROOT, check=True)
    asyncio.run(check(bundle))
