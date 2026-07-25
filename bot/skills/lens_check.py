"""Skill CLI: reverse-search anh bang GOOGLE LENS qua trinh duyet that (Playwright + Chrome).

WHY khong dung API: Google khong mo API reverse image search; Vision Web Detection thi team
che "check ko ok". Vay lam dung cach nguoi that: mo Chrome -> upload anh vao Google Images
(nut camera) -> cao 2 tab ket qua:
  - "Ket qua khop chinh xac"  -> trang web dang dung CHINH XAC anh nay (bang chung copy)
  - "Hinh anh trung khop"     -> anh trong giong
Tai thumbnail tung ket qua ve workspace, so PERCEPTUAL HASH (dHash + aHash, chi can Pillow)
voi anh goc, in bao cao kem link. Anh da tai nam tren dia de Claude MO XEM TAN MAT roi chot
"copy that hay chi giong phong cach".

Chong bi Google nghi la bot (bai hoc tu luc build — giu lai keo lai do vong):
  - Chromium headless bi google.com/sorry (CAPTCHA) NGAY -> phai HEADFUL + channel="chrome"
    (Chrome that). Nghia la MAY CHAY BOT CAN MAN HINH; cua so Chrome hien len ~30-60s/luot.
  - Dung PROFILE CHROME THAT da dang nhap Google (mac dinh profile ten "Easygoing", doi bang
    env LENS_CHROME_PROFILE): tai khoan that -> Google tin hon han profile trang. Khong dung
    thang User Data goc duoc (Chrome dang mo se khoa + Chrome moi chan automation tren do)
    -> COPY profile ra workspace/lens_profile mot lan (bo cac thu muc cache nang), chay tren
    ban copy. Cookie cu / session het han thi chay lai voi --refresh-profile de copy moi.
  - MOI thoi gian cho / cuon / tai anh deu RANDOM (nguoi that khong bam deu tam tap).
  - uploadbyurl?url=... PHAP PHU (hay loi "Khong co hinh anh tai URL nay") -> luon tai anh
    ve local roi UPLOAD FILE qua nut camera.
  - Ket qua render lazy bang JS; thumbnail tra ve dang data-URI base64.

Rui ro chap nhan: scrape UI Google — doi giao dien thi va selector; volume nho thi on. Khi
khong cao duoc gi, skill tu luu debug.png + debug.html vao thu muc ket qua de nguoi sua xem.

AI CUNG goi duoc (chi doc web, khong ghi DB).

Vi du:
    python lens_check.py --url "https://cdn.discordapp.com/attachments/.../a.png?ex=..."
    python lens_check.py --refresh-profile --url "..."   # copy lai profile khi session cu
"""

import argparse
import base64
import json
import os
import random
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs

try:
    sys.stdout.reconfigure(encoding="utf-8")   # Windows console -> UTF-8 cho tieng Viet
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

_BOT_DIR = Path(__file__).resolve().parent.parent
_OUT_ROOT = _BOT_DIR / "workspace" / "lens_check"       # workspace = cwd cua Claude khi bot goi
_PROFILE_ROOT = _BOT_DIR / "workspace" / "lens_profile"  # ban COPY cua Chrome User Data
_TIMEOUT_MS = 45_000
_MAX_IMAGES = 2         # moi anh ~30-60s trinh duyet; qua 2 la de cham timeout cua Claude
_MIN_THUMB_BYTES = 900  # data-URI placeholder 1px thi bo
_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# Profile Chrome that de muon cookie (ten HIEN THI trong Chrome, khong phai ten thu muc).
_PROFILE_DISPLAY = os.getenv("LENS_CHROME_PROFILE", "Easygoing")
_CHROME_USER_DATA = Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "User Data"
# Thu muc cache/nang — khong can cho dang nhap, bo ra cho ban copy nhe (~vai tram MB -> vai chuc).
_COPY_IGNORE = {
    "Cache", "Code Cache", "GPUCache", "GrShaderCache", "ShaderCache", "DawnGraphiteCache",
    "DawnWebGPUCache", "Service Worker", "IndexedDB", "File System", "blob_storage",
    "Download Service", "optimization_guide_model_store", "Site Characteristics Database",
    "Safe Browsing", "Session Storage", "Extensions", "Local Extension Settings",
    "Extension State", "Extension Rules", "Extension Scripts", "Managed Extension Settings",
    "Sync Extension Settings", "WidevineCdm", "MediaFoundationWidevineCdm",
}

# Ten tab theo ngon ngu giao dien (vi truoc, en du phong).
_EXACT_TABS = ("Kết quả khớp chính xác", "Exact matches")
_VISUAL_TABS = ("Hình ảnh trùng khớp", "Visual matches")

# Nguong khoang cach Hamming (0-64, 0 = trung tuyet doi) tren min(dHash, aHash).
_TH_STRONG = 9    # <= : gan nhu chac chan cung mot anh (resize/crop nhe/doi mau nhe)
_TH_NEAR = 17     # <= : kha giong — bat buoc mo mat xem


_KEEP_HOURS = 24  # anh tai ve chi can song du lau de Claude mo xem + nguoi dung doi chieu


def die(message: str):
    print(f"LOI: {message}")
    sys.exit(1)


def _cleanup_old_runs():
    """Tu don rac: xoa thu muc ket qua cu hon _KEEP_HOURS moi lan chay.

    KHONG xoa ngay sau khi tra ket qua — Claude con phai MO cac file nay ra xem de chot
    verdict, va nguoi dung co the muon doi chieu lai. 24h la du, sau do la rac.
    """
    import shutil
    cutoff = time.time() - _KEEP_HOURS * 3600
    try:
        for d in _OUT_ROOT.iterdir():
            if d.is_dir() and d.stat().st_mtime < cutoff:
                shutil.rmtree(d, ignore_errors=True)
    except FileNotFoundError:
        pass  # chua tung chay lan nao


def _pause(page, lo_ms: int, hi_ms: int):
    """Cho mot khoang NGAU NHIEN — nguoi that khong thao tac deu tam tap."""
    page.wait_for_timeout(random.uniform(lo_ms, hi_ms))


# --- Muon profile Chrome that (cookie dang nhap Google) ------------------------

def _resolve_profile_dir() -> str | None:
    """Ten thu muc profile ('Profile 1'...) tu ten hien thi ('Easygoing'). None = khong thay."""
    try:
        state = json.loads((_CHROME_USER_DATA / "Local State").read_text(encoding="utf-8"))
    except Exception:
        return None
    want = _PROFILE_DISPLAY.strip().lower()
    for dirname, info in state.get("profile", {}).get("info_cache", {}).items():
        if (info.get("name") or "").strip().lower() == want:
            return dirname
    return None


def _copy_tree_lenient(src: Path, dst: Path):
    """Copy de quy, BO thu muc trong _COPY_IGNORE va NUOT loi tung file (Chrome dang mo
    thi vai file db bi khoa — mat file le con hon hong ca ban copy)."""
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        target = dst / item.name
        try:
            if item.is_dir():
                if item.name in _COPY_IGNORE:
                    continue
                _copy_tree_lenient(item, target)
            else:
                import shutil
                shutil.copy2(item, target)
        except Exception:
            continue  # file khoa / dang ghi do — bo qua


def _bootstrap_profile(refresh: bool) -> str | None:
    """Dam bao ban copy profile ton tai. Tra ve ten thu muc profile de --profile-directory,
    None = khong muon duoc profile that (chay profile trang van duoc, chi de bi CAPTCHA hon)."""
    pdir = _resolve_profile_dir()
    if not pdir:
        print(f"(Không thấy profile Chrome tên '{_PROFILE_DISPLAY}' — chạy bằng profile trắng, "
              "dễ bị CAPTCHA hơn. Đặt env LENS_CHROME_PROFILE nếu tên khác.)", file=sys.stderr)
        return None
    copied = _PROFILE_ROOT / pdir
    if refresh and copied.exists():
        import shutil
        shutil.rmtree(copied, ignore_errors=True)
    if not copied.exists():
        src = _CHROME_USER_DATA / pdir
        if not src.exists():
            return None
        print(f"(Copy profile Chrome '{_PROFILE_DISPLAY}' [{pdir}] ra bản riêng cho bot — "
              "chỉ lần đầu / khi --refresh-profile...)", file=sys.stderr)
        _copy_tree_lenient(src, copied)
        # Local State giu khoa giai ma cookie (os_crypt) — thieu no la cookie thanh rac.
        try:
            import shutil
            shutil.copy2(_CHROME_USER_DATA / "Local State", _PROFILE_ROOT / "Local State")
        except Exception:
            pass
    return pdir


# --- So sanh anh (Pillow thuan, khong them dependency) -------------------------

def _hashes(img) -> tuple[int, int]:
    """(dHash, aHash) 64-bit tren anh xam — du nhay cho thumbnail Lens."""
    g9 = img.convert("L").resize((9, 8)).tobytes()
    d = 0
    for row in range(8):
        for col in range(8):
            d = (d << 1) | (1 if g9[row * 9 + col] > g9[row * 9 + col + 1] else 0)
    g8 = img.convert("L").resize((8, 8)).tobytes()
    avg = sum(g8) / 64
    a = 0
    for v in g8:
        a = (a << 1) | (1 if v > avg else 0)
    return d, a


def _distance(ref_h: tuple[int, int], other_h: tuple[int, int]) -> int:
    """min(hamming dHash, hamming aHash) — anh bi crop/chinh nhe van bat duoc."""
    dd = bin(ref_h[0] ^ other_h[0]).count("1")
    da = bin(ref_h[1] ^ other_h[1]).count("1")
    return min(dd, da)


# --- Tai anh -------------------------------------------------------------------

def _download_ref(url: str, dest: Path) -> bytes:
    import requests
    try:
        resp = requests.get(url, headers={"User-Agent": _UA}, timeout=30)
    except Exception as e:
        die(f"tải ảnh gốc thất bại (mạng): {str(e)[:150]}")
    if not resp.ok:
        die(f"tải ảnh gốc HTTP {resp.status_code} — link có thể đã hết hạn, gửi lại ảnh nhé.")
    if not resp.content:
        die("ảnh gốc tải về rỗng (0 byte).")
    dest.write_bytes(resp.content)
    return resp.content


def _thumb_bytes(src: str) -> bytes | None:
    """Bytes thumbnail ket qua: data-URI giai ma tai cho; http thi tai ve SAU MOT NHIP
    NGAU NHIEN (0.4-1.4s) de chuoi request khong deu nhu may. None = bo."""
    if src.startswith("data:image"):
        try:
            raw = base64.b64decode(src.split(",", 1)[1])
        except Exception:
            return None
        return raw if len(raw) >= _MIN_THUMB_BYTES else None
    if src.startswith("http"):
        import requests
        time.sleep(random.uniform(0.4, 1.4))
        try:
            resp = requests.get(src, headers={"User-Agent": _UA}, timeout=20)
            if resp.ok and len(resp.content) >= _MIN_THUMB_BYTES:
                return resp.content
        except Exception:
            return None
    return None


# --- Cao Google Lens (flow da kiem chung: upload file qua nut camera) ----------

# Hai layout Google tung dung (phai bat ca hai — xem probe 2026-07-25):
#   (1) cu: thumbnail nam TRONG <a> (tab khong query) — lay img LON NHAT moi anchor,
#       vi img dau tien thuong la FAVICON 32px cua trang (tung vo nham -> folder toan icon).
#   (2) moi (sau khi go query): thumbnail to nam NGOAI <a> (card dung click-handler);
#       leo len to tien toi khi gap container chua link ngoai roi ghep img + link do.
# Loai: favicon (render < 48px / naturalWidth < 64), placeholder lazy chua tai, va
# lens.usercontent (chinh anh minh vua upload).
_COLLECT_JS = r"""
() => {
  const out = [];
  const clean = t => (t || '').replace(/\s+/g, ' ').trim().slice(0, 150);
  const seen = new Set();
  const add = (href, src, label) => {
    if (!href || !src || seen.has(href)) return;
    seen.add(href);
    out.push({ href, src, label });
  };
  const good = i => {
    const src = i.currentSrc || i.src || '';
    if (!src || src.startsWith('https://lens.usercontent')) return false;
    if ((i.naturalWidth || 0) < 64 && src.length < 3000) return false;
    if ((i.width || 0) > 0 && (i.width || 0) < 48) return false;
    return true;
  };
  const extA = node => [...node.querySelectorAll('a[href]')].find(x => {
    try { return /^https?:/.test(x.href) && !/(^|\.)google\./.test(new URL(x.href).hostname); }
    catch { return false; }
  });
  document.querySelectorAll('a[href]').forEach(a => {
    let best = null, bw = -1;
    a.querySelectorAll('img').forEach(i => {
      if (!good(i)) return;
      const w = Math.max(i.naturalWidth || 0, i.width || 0);
      if (w > bw) { bw = w; best = i; }
    });
    if (best) add(a.href, best.currentSrc || best.src,
                  clean(a.getAttribute('aria-label') || a.textContent));
  });
  [...document.images].forEach(img => {
    if (!good(img) || img.closest('a[href]')) return;
    let node = img.parentElement;
    for (let up = 0; up < 6 && node; up++, node = node.parentElement) {
      const a = extA(node);
      if (a) { add(a.href, img.currentSrc || img.src, clean(node.textContent)); break; }
    }
  });
  return out;
}
"""


def _unwrap(href: str) -> str | None:
    """Link ket qua -> link trang nguon: bo /url?q= cua Google, bo link noi bo Google."""
    try:
        u = urlparse(href)
    except Exception:
        return None
    host = (u.netloc or "").lower()
    if "google." in host:
        if u.path.startswith("/url"):
            q = parse_qs(u.query).get("q") or parse_qs(u.query).get("url")
            return q[0] if q and q[0].startswith("http") else None
        return None
    return href if href.startswith("http") else None


def _save_debug(page, out_dir: Path):
    try:
        page.screenshot(path=str(out_dir / "debug.png"))
        (out_dir / "debug.html").write_text(page.content(), encoding="utf-8")
    except Exception:
        pass


def _human_scroll(page):
    """Cuon 3-4 nhip ngau nhien roi ve dau trang — vua giong nguoi vua ep lazy-load
    tai het thumbnail that (cao som la dinh placeholder be ti thay vi anh)."""
    for _ in range(random.randint(3, 4)):
        page.mouse.wheel(0, random.uniform(900, 2100))
        _pause(page, 450, 1300)
    page.mouse.wheel(0, -6000)
    _pause(page, 900, 1800)


def _wait_thumbs(page, min_count: int = 5, timeout_ms: int = 12_000):
    """Doi lazy-load NAP XONG thumbnail that (naturalWidth >= 64) roi moi cao.

    Cao som la dinh placeholder 1px/la co 28px -> ket qua 'chua so duoc' hang loat
    (bug tung gap voi tab Hinh anh trung khop sau khi go query)."""
    waited = 0.0
    while waited < timeout_ms:
        try:
            n = page.evaluate(
                "() => [...document.querySelectorAll('a[href] img')]"
                ".filter(i => i.naturalWidth >= 64).length")
        except Exception:
            return
        if n >= min_count:
            return
        step = random.uniform(700, 1400)
        page.wait_for_timeout(step)
        waited += step


def _apply_query(page, query: str) -> bool:
    """Go tu khoa vao o "Them vao noi dung tim kiem" cua Lens -> Google TU LOC ket qua
    trong giong theo ngu canh do (vd 'game'). Go tung ky tu co delay ngau nhien cho giong
    nguoi. True = da ap dung duoc."""
    for sel in ("textarea[placeholder*='Thêm']", "input[placeholder*='Thêm']",
                "textarea[aria-label*='Tìm kiếm']", "textarea[name='q']", "input[name='q']"):
        try:
            box = page.locator(sel).first
            box.click(timeout=2500)
            box.type(query, delay=random.uniform(60, 160))
            page.keyboard.press("Enter")
            _pause(page, 4000, 7000)   # Google chay lai tim kiem anh + tu khoa
            return True
        except Exception:
            continue
    return False


def _collect_grid(page, kind: str, limit: int, seen: set) -> list[dict]:
    """Gom ket qua dang hien tren trang (khong bam tab) — duong lui khi khong co tab."""
    _human_scroll(page)
    _wait_thumbs(page)
    raw = page.evaluate(_COLLECT_JS)
    out = []
    for it in raw:
        href = _unwrap(it.get("href") or "")
        src = it.get("src") or ""
        if not href or not src or href in seen:
            continue
        seen.add(href)
        out.append({"href": href, "src": src, "label": it.get("label") or "", "kind": kind})
        if len(out) >= limit:
            break
    return out


def _scrape_tab(page, tab_names: tuple, kind: str, limit: int) -> list[dict]:
    """Bam 1 tab ket qua roi gom [{href, src, label, kind}]. Tab khong co -> []."""
    clicked = False
    for name in tab_names:
        try:
            page.locator(f"text={name}").first.click(timeout=4000)
            clicked = True
            break
        except Exception:
            continue
    if not clicked:
        return []
    _pause(page, 3500, 6500)             # tab render lazy
    _human_scroll(page)                  # keo cho lazy-load anh
    _wait_thumbs(page)                   # va DOI anh that nap xong (khong cao placeholder)
    raw = page.evaluate(_COLLECT_JS)
    out, seen = [], set()
    for it in raw:
        href = _unwrap(it.get("href") or "")
        src = it.get("src") or ""
        if not href or not src or href in seen:
            continue
        seen.add(href)
        out.append({"href": href, "src": src, "label": it.get("label") or "", "kind": kind})
        if len(out) >= limit:
            break
    return out


def _lens_results(ref_file: Path, out_dir: Path, limit: int, profile_dir: str | None,
                  query: str = "", include_exact: bool = False) -> list[dict]:
    """Mo Chrome that (profile Easygoing copy) -> upload anh -> cao ket qua.

    NGUON CHINH la tab "Hinh anh trung khop" (yeu cau chu du an 2026-07-25 — ket qua art
    game nam o day; tab "khop chinh xac" hay ra stock site, gay nhieu). include_exact=True
    moi cao them tab exact (truoc khi go query, vi go query xong tab cu bien mat).
    query != "" -> go tu khoa vao o "Them vao noi dung tim kiem" de Google loc phan
    "trong giong" theo ngu canh (vd chi anh lien quan game)."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        die("thiếu Playwright. Cài: pip install playwright && playwright install chromium")

    with sync_playwright() as p:
        ctx = None
        extra = [f"--profile-directory={profile_dir}"] if profile_dir else []
        # Chrome that (channel) truoc — headless/Chromium bi Google CAPTCHA ngay (da thu).
        for launch_kw in ({"channel": "chrome"}, {}):
            try:
                ctx = p.chromium.launch_persistent_context(
                    str(_PROFILE_ROOT), headless=False, locale="vi-VN",
                    viewport={"width": 1440, "height": 900},
                    args=["--disable-blink-features=AutomationControlled", *extra],
                    **launch_kw,
                )
                break
            except Exception:
                continue
        if ctx is None:
            die("không mở được Chrome/Chromium (máy chạy bot cần cài Chrome và có màn hình; "
                "đã 'playwright install chromium' chưa?)")
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
        try:
            page.goto("https://www.google.com/imghp?hl=vi", timeout=_TIMEOUT_MS)
            # Man consent (tuy vung) — best effort.
            for sel in ("button#L2AGLb", "button:has-text('Chấp nhận tất cả')",
                        "button:has-text('Accept all')"):
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=700):
                        btn.click()
                        break
                except Exception:
                    pass
            _pause(page, 900, 2200)
            # Nut camera "Tim kiem bang hinh anh" -> input file (flow da kiem chung).
            page.locator("[aria-label*='hình ảnh'], [aria-label*='Search by image']").first.click(
                timeout=8000)
            _pause(page, 700, 1600)
            page.set_input_files("input[type=file]", str(ref_file), timeout=8000)
            page.wait_for_url("**/search*", timeout=30_000)   # Google chuyen sang trang ket qua
            _pause(page, 5000, 8500)                           # ket qua stream ve ("Dang suy nghi")

            if "/sorry/" in page.url:
                _save_debug(page, out_dir)
                die("Google đang tạm chặn máy này (CAPTCHA 'lưu lượng bất thường'). "
                    "Đợi ít phút rồi thử lại; nếu gấp, dùng đường Vision: "
                    'python skills/image_check.py --url "..."')

            results, seen = [], set()
            # Tab exact CHI KHI duoc yeu cau (--exact) — va phai cao TRUOC khi go query
            # (go query xong trang doi sang multisearch, tab cu bien mat).
            if include_exact:
                results = _scrape_tab(page, _EXACT_TABS, "exact", limit)
                seen = {r["href"] for r in results}
            if query and not _apply_query(page, query):
                print(f"(Không tìm thấy ô nhập từ khoá — bỏ lọc '{query}', trả kết quả thường.)",
                      file=sys.stderr)
            # NGUON CHINH: tab "Hinh anh trung khop". Sau khi go query, trang dich mo o tab
            # "All" (mo hon lon web/video be ti) — van phai bam sang tab nay roi moi cao.
            got = _scrape_tab(page, _VISUAL_TABS, "visual", limit)
            if not got:  # giao dien khong co tab (hiem) -> gom trang hien tai con hon trang tay
                got = _collect_grid(page, "visual", limit, set(seen))
            results += [r for r in got if r["href"] not in seen]
            if not results:
                _save_debug(page, out_dir)
        except SystemExit:
            raise
        except Exception as e:
            _save_debug(page, out_dir)
            ctx.close()
            die(f"lỗi khi cào Google Lens: {str(e)[:200]} (đã lưu debug vào {out_dir})")
        ctx.close()
        return results


# --- Bao cao -------------------------------------------------------------------

def _fmt(s: dict, with_file: bool = True) -> str:
    label = f" — {s['label']}" if s["label"] else ""
    dist = ("chưa so được — thumbnail không tải được" if s["dist"] is None
            else f"khoảng cách {s['dist']}/64")
    lines = [f"   • [{dist}]{label}\n     {s['href']}"]
    if with_file and s.get("file"):
        lines.append(f"     ảnh đã tải: {s['file']}")
    return "\n".join(lines)


def _check_one(image_url: str, out_dir: Path, limit: int, idx: int, total: int,
               profile_dir: str | None, query: str = "", include_exact: bool = False) -> str:
    from io import BytesIO
    try:
        from PIL import Image
    except ImportError:
        die("thiếu Pillow. Cài: pip install pillow")

    ref_path = out_dir / f"ref-{idx}.png"
    ref_bytes = _download_ref(image_url, ref_path)
    try:
        ref_h = _hashes(Image.open(BytesIO(ref_bytes)))
    except Exception:
        die("file gửi lên không đọc được như một ảnh (đúng là ảnh chứ không phải video/file khác chứ?)")

    results = _lens_results(ref_path, out_dir, limit, profile_dir, query, include_exact)
    head = f"🖼️ Ảnh {idx}/{total}" if total > 1 else "🖼️ Kết quả Google Lens"
    if query:
        head += f" (phần “trông giống” đã lọc theo từ khoá “{query}”)"
    if not results:
        return (f"{head}: Lens KHÔNG trả về kết quả nào — hoặc ảnh chưa từng xuất hiện trên web, "
                f"hoặc Google đổi giao diện (xem {out_dir / 'debug.png'} để biết trang trông ra sao).")

    scored = []
    for i, r in enumerate(results, 1):
        tb = _thumb_bytes(r["src"])
        # dist=None = KHONG SO DUOC (thumbnail khong tai duoc / khong doc duoc) — khac han
        # voi "rat khac" (64). Nhap chung tung lam ket qua that bi chon xuong day.
        entry = {"dist": None, "href": r["href"], "label": r["label"], "kind": r["kind"], "file": None}
        if tb is not None:
            try:
                im = Image.open(BytesIO(tb))
                # Duoi 64px = placeholder lazy-load chua tai xong, khong phai thumbnail that
                # -> khong luu (rac) va khong cham hash (so voi placeholder ra distance lao).
                if min(im.size) >= 64:
                    fp = out_dir / f"match-{idx}-{i:02d}.jpg"
                    fp.write_bytes(tb)
                    entry["file"] = fp
                    entry["dist"] = _distance(ref_h, _hashes(im))
            except Exception:
                pass
        scored.append(entry)

    # Tab "khop chinh xac" = Google khang dinh trang do dung DUNG anh nay -> bang chung manh
    # nhat, xep rieng len dau bat ke khoang cach hash (thumbnail co the bi crop/vien).
    # dist=None (khong so duoc) xep cuoi moi nhom, va khong bao gio duoc tinh la strong/near.
    by_dist = lambda x: (x["dist"] is None, x["dist"] if x["dist"] is not None else 64)
    exact = sorted([s for s in scored if s["kind"] == "exact"], key=by_dist)
    visual = sorted([s for s in scored if s["kind"] != "exact"], key=by_dist)
    strong = [s for s in visual if s["dist"] is not None and s["dist"] <= _TH_STRONG]
    near = [s for s in visual if s["dist"] is not None and _TH_STRONG < s["dist"] <= _TH_NEAR]
    rest = [s for s in visual if s["dist"] is None or s["dist"] > _TH_NEAR]

    lines = [f"{head} — {len(scored)} kết quả trang 1, ảnh đã tải về {out_dir}",
             f"   (ảnh gốc: {ref_path})"]
    if exact:
        lines.append(f"🔴 TRANG DÙNG CHÍNH XÁC ẢNH NÀY ({len(exact)}) — theo tab “Kết quả khớp "
                     "chính xác” của Google, đây là bằng chứng copy mạnh nhất:")
        lines += [_fmt(s) for s in exact[:10]]
        if len(exact) > 10:
            lines.append(f"   … và {len(exact) - 10} trang khác nữa.")
    if strong:
        lines.append(f"🟠 RẤT GIỐNG về điểm ảnh ({len(strong)}) — khả năng cao cùng một ảnh:")
        lines += [_fmt(s) for s in strong]
    if near:
        lines.append(f"🟡 KHÁ GIỐNG ({len(near)}) — cần mở ảnh so bằng mắt:")
        lines += [_fmt(s) for s in near]
    if rest:
        # VAN in duong dan file cho top ⚪: hash chi bat duoc anh gan-y-het — art ve lai
        # (dao nhai kieu stylized) thi hash cao nhung MAT nguoi/Claude nhin van nhan ra.
        # Giau file di la Claude khong mo xem duoc -> tung bao nham "khong thay" du co ket qua.
        lines.append(f"⚪ Khác về ĐIỂM ẢNH ({len(rest)}) — nhưng có thể là VẼ LẠI/cùng phong cách, "
                     "cần mở file so bằng mắt:")
        lines += [_fmt(s) for s in rest[:8]]
        if len(rest) > 8:
            lines.append(f"   … và {len(rest) - 8} link khác.")
    if not exact and not strong and not near:
        lines.append(f"ℹ️ Không có kết quả TRÙNG KHỚP điểm ảnh, nhưng Lens vẫn trả về {len(rest)} "
                     "kết quả liên quan ở trên. Trùng điểm ảnh chỉ bắt được copy nguyên file — "
                     "art VẼ LẠI sẽ không trùng hash; phải mở các file ⚪ so bằng mắt rồi mới "
                     "kết luận, ĐỪNG vội nói 'không thấy'.")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="Reverse-search anh bang Google Lens (Playwright).")
    ap.add_argument("--url", action="append", default=[], help="URL anh can kiem tra (lap lai duoc)")
    ap.add_argument("--limit", type=int, default=24, help="So ket qua toi da moi tab (mac dinh 24)")
    ap.add_argument("--query", default="",
                    help="Tu khoa loc phan 'trong giong' (vd 'game') — go vao o "
                         "'Them vao noi dung tim kiem' cua Lens; tab khop chinh xac KHONG bi loc")
    ap.add_argument("--exact", action="store_true",
                    help="Cao THEM tab 'Ket qua khop chinh xac' (mac dinh chi dung tab "
                         "'Hinh anh trung khop' theo yeu cau chu du an)")
    ap.add_argument("--refresh-profile", action="store_true",
                    help="Copy lai profile Chrome (khi cookie ban copy het han/hong)")
    args = ap.parse_args()

    urls = [u.strip() for u in args.url if u and u.strip()]
    if not urls:
        die("cần ít nhất một --url ảnh để kiểm tra.")
    dropped = len(urls) - _MAX_IMAGES if len(urls) > _MAX_IMAGES else 0
    urls = urls[:_MAX_IMAGES]

    _cleanup_old_runs()  # don ket qua cu (>24h) truoc khi tao dot moi
    profile_dir = _bootstrap_profile(args.refresh_profile)
    out_dir = _OUT_ROOT / datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)

    blocks = []
    for i, u in enumerate(urls, 1):
        if i > 1:
            time.sleep(random.uniform(2.5, 6.0))  # nghi ngau nhien giua 2 anh — bot khong nghi
        blocks.append(_check_one(u, out_dir, args.limit, i, len(urls), profile_dir,
                                 args.query.strip(), args.exact))
    if dropped:
        blocks.append(f"(Đã bỏ qua {dropped} ảnh — mỗi lượt tối đa {_MAX_IMAGES} ảnh, gọi thêm lượt nữa nhé.)")
    print("\n\n".join(blocks))


if __name__ == "__main__":
    main()
