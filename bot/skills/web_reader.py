"""Doc noi dung tu URL -> list (section, text). Dung cho link trong docs/links.txt.

- HTML  -> lay text (BeautifulSoup, bo script/style/nav/footer).
- PDF    -> tai ve file tam roi dung doc_reader (pypdf).
- text/markdown/csv/json -> giu nguyen text.
Thu vien nang (bs4/pypdf) import lazy -> chi can khi thuc su nap link.
"""

import os
import tempfile

import requests

import doc_reader

_TIMEOUT = int(os.getenv("RAG_FETCH_TIMEOUT", "30"))
_HEADERS = {"User-Agent": "bot-work-tracker RAG ingest/1.0"}
_MAX_BYTES = int(os.getenv("RAG_FETCH_MAX_BYTES", str(20 * 1024 * 1024)))  # 20MB


class FetchError(Exception):
    """Loi khi tai / doc URL -> caller ghi nhan va bo qua link do."""


def _looks_like_pdf(url: str, content_type: str) -> bool:
    return "pdf" in content_type or url.lower().split("?")[0].endswith(".pdf")


def _html_to_text(html: str) -> str:
    try:
        from bs4 import BeautifulSoup
    except ImportError as e:
        raise FetchError("thiếu 'beautifulsoup4' (pip install -r requirements.txt)") from e

    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "svg"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return "\n".join(lines)


def _read_pdf_bytes(data: bytes) -> list:
    """Ghi bytes PDF ra file tam roi dung doc_reader (tai su dung logic pypdf)."""
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    try:
        tmp.write(data)
        tmp.close()
        return doc_reader.read_sections(tmp.name)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def read_url(url: str) -> list:
    """Tai 1 URL -> list (section, text). Nem FetchError neu that bai."""
    url = url.strip()
    if not url.lower().startswith(("http://", "https://")):
        raise FetchError(f"không phải URL http(s): '{url}'")

    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT, stream=True)
        resp.raise_for_status()
        data = resp.content[:_MAX_BYTES] if resp.content else b""
    except requests.RequestException as e:
        raise FetchError(f"tải thất bại: {e}") from e

    if not data:
        raise FetchError("nội dung rỗng")

    content_type = (resp.headers.get("content-type") or "").lower()

    if _looks_like_pdf(url, content_type):
        sections = _read_pdf_bytes(data)
        return sections or [("trang web", "")]

    charset = resp.encoding or "utf-8"
    text = data.decode(charset, errors="replace")

    if "html" in content_type or "<html" in text[:2000].lower():
        return [("trang web", _html_to_text(text))]
    return [("nội dung", text)]  # text / markdown / csv / json
