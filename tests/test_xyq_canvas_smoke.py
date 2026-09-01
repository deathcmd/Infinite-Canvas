from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(f"{BASE}/static/index.html", wait_until="domcontentloaded")
        page.wait_for_timeout(700)
        theme = page.evaluate("""() => {
            const sidebar = document.querySelector('#studioSidebar');
            const text = document.querySelector('.nav-item');
            return {
                sidebarBackground: sidebar ? getComputedStyle(sidebar).backgroundColor : '',
                sidebarText: text ? getComputedStyle(text).color : '',
                owner: !!document.querySelector('#studioOwnerCard')
            };
        }""")
        assert theme["sidebarBackground"] and theme["sidebarText"] and theme["sidebarBackground"] != theme["sidebarText"], theme
        assert theme["owner"], theme
        page.goto(f"{BASE}/static/canvas-list.html", wait_until="domcontentloaded")
        page.wait_for_timeout(600)
        page.locator("#newCanvasBtn").click()
        page.wait_for_selector(".ws-create-card")
        for kind in ("character", "scene", "stage3d", "prompt", "image", "video", "audio"):
            page.locator(f'.ws-create-chip[data-kind="{kind}"]').click()
        page.locator(".ws-create-confirm").click()
        page.wait_for_url("**/canvas.html**", timeout=15000)
        page.wait_for_function("() => window.VideoWorkflowSchema && window.VideoWorkflowAdapter && window.VideoWorkflowPanel", timeout=15000)
        # The workflow desk is mounted asynchronously after the canvas shell
        # bootstraps.  A fixed sleep made this smoke test race on a cold
        # browser (the schema existed while the stage tabs/tools had not yet
        # been painted).  Wait on the visible contract instead, then keep a
        # short settle delay for icon hydration and provider options.
        page.wait_for_selector(".vwf-stage-tab", timeout=15000)
        page.wait_for_function(
            "() => !!document.querySelector('.video-float-tools, .asset-card-tools')",
            timeout=15000,
        )
        page.wait_for_timeout(200)
        if page.locator("body.vwf-desk-on, .vwf-stage.is-desk").count():
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)
        info = page.evaluate("""() => {
            const schema = window.VideoWorkflowSchema;
            const tabs = [...document.querySelectorAll('.vwf-stage-tab')].map(el => (el.textContent || '').trim());
            return {
                purposes: schema.PURPOSES,
                local: schema.isLocalEngine('comfyui') && schema.isLocalEngine('openai_local'),
                tabs,
                floatTools: !!document.querySelector('.video-float-tools'),
                assetTools: !!document.querySelector('.asset-card-tools'),
                videoProviders: [...document.querySelectorAll('.video-provider option')].map(o => o.value)
            };
        }""")
        assert info["local"], info
        assert "motion" in info["purposes"] and "layout" in info["purposes"], info
        assert any("材质" in t for t in info["tabs"]), info
        assert info["floatTools"] and info["assetTools"], info
        assert "" in info["videoProviders"]
        assert "comfyui" in info["videoProviders"]
        assert "openai_local" in info["videoProviders"]
        leftover = page.evaluate("""async () => {
            const schema = window.VideoWorkflowSchema;
            const wf = schema.normalize({
                extraRefs: [{kind:'video', purpose:'motion', url:'http://local/move.mp4', name:'运镜'}],
                audioTracks: [{kind:'sfx', text:'雨声', url:'http://local/rain.wav'}],
                audioSplit: true,
                analyze: 'parse'
            });
            const out = await window.VideoWorkflowAdapter.apply({prompt:'巷口', workflow:wf, previousVideos:[]});
            return {
                videos: out.videos,
                audios: out.audios,
                motion: out.leftover.motionOnly,
                prompt: out.prompt,
                text: JSON.stringify(out)
            };
        }""")
        assert "http://local/move.mp4" not in (leftover["videos"] or []), leftover
        assert leftover["motion"], leftover
        assert "http://local/rain.wav" in (leftover["audios"] or []), leftover
        assert "【只参考运镜】" in leftover["prompt"]
        assert "【音频分离】" in leftover["prompt"]
        assert "seedance" not in leftover["text"].lower()
        page.screenshot(path="data/xyq-workflow-smoke.png")
        browser.close()
        print("OK")


if __name__ == "__main__":
    main()
