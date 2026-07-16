"""Cong I/O toi Gmail API — OAuth NGUOI DUNG (khong phai service account nhu sheets).

WHY OAuth: mail weekly report gui di duoi danh nghia nick Gmail that cua admin, va
template do admin soan nam trong hop thu cua ho — service account khong voi toi duoc
(domain-wide delegation can quyen admin Workspace, khong dung o day).

LUU Y TEMPLATE: muc "Templates" cua Gmail (Settings > Advanced) KHONG doc duoc qua API.
Template phai la mot DRAFT (thu nhap) — soan thu tu template roi bam X luu nhap la xong.
Skill tim draft theo subject (mac dinh chua "[TEMPLATE]").

Setup MOT LAN tren may chay bot:
  1. GCP project (cung project voi GA4, vd work-tracker-502408) > bat **Gmail API**.
  2. APIs & Services > Credentials > Create OAuth client ID > loai **Desktop app**
     > tai JSON ve `keys/gmail-oauth-client.json`.
  3. Chay `python skills/gmail_gateway.py --auth` > trinh duyet mo ra, dang nhap nick
     SE GUI MAIL, bam cho phep. Token luu `keys/gmail-token.json`, tu refresh ve sau.
"""

import base64
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import requests

_KEYS_DIR = Path(__file__).resolve().parent.parent.parent / "keys"
CLIENT_PATH = _KEYS_DIR / "gmail-oauth-client.json"
TOKEN_PATH = _KEYS_DIR / "gmail-token.json"

_API = "https://gmail.googleapis.com/gmail/v1/users/me"
_TIMEOUT = 30
# readonly de tim/doc draft template, send de gui. KHONG xin quyen sua/xoa thu.
_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]


class GmailError(Exception):
    """Loi goi Gmail API — caller tu quyet in ra sao."""


def auth_flow() -> None:
    """Chay MOT LAN: mo trinh duyet xin quyen, luu token. Can keys/gmail-oauth-client.json."""
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as e:
        raise GmailError(
            "thiếu google-auth-oauthlib. Cài: pip install -r bot/requirements.txt"
        ) from e
    if not CLIENT_PATH.exists():
        raise GmailError(
            f"không thấy OAuth client '{CLIENT_PATH}'. Tạo OAuth Client ID (Desktop app) "
            f"trong GCP Console rồi tải JSON về đúng chỗ đó (xem docstring gmail_gateway.py)."
        )
    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_PATH), _SCOPES)
    creds = flow.run_local_server(port=0)
    TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    print(f"OK: đã lưu token vào {TOKEN_PATH}")


def session() -> requests.Session:
    """Session gan Bearer token cua nguoi dung; tu refresh khi het han."""
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
    except ImportError as e:
        raise GmailError(
            "thiếu thư viện google-auth. Cài: pip install -r bot/requirements.txt"
        ) from e
    if not TOKEN_PATH.exists():
        raise GmailError(
            f"chưa đăng nhập Gmail: không thấy '{TOKEN_PATH}'. "
            f"Chạy 1 lần: python skills/gmail_gateway.py --auth"
        )
    creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), _SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    sess = requests.Session()
    sess.headers["Authorization"] = f"Bearer {creds.token}"
    return sess


def _check(resp: requests.Response, what: str):
    if resp.status_code in (401, 403):
        raise GmailError(
            f"{what}: bị từ chối ({resp.status_code}). Token hỏng/thiếu quyền — chạy lại "
            f"`python skills/gmail_gateway.py --auth`."
        )
    if not resp.ok:
        raise GmailError(f"{what}: HTTP {resp.status_code} — {resp.text[:200]}")


def _walk_for_html(part: dict) -> str | None:
    """Tim phan text/html trong cay MIME cua message (draft co the multipart nhieu tang)."""
    if part.get("mimeType") == "text/html":
        data = part.get("body", {}).get("data")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    for child in part.get("parts", []) or []:
        html = _walk_for_html(child)
        if html:
            return html
    return None


def find_template_draft(sess: requests.Session, subject_token: str) -> dict:
    """Draft dau tien co subject chua `subject_token` -> {"subject": ..., "html": ...}."""
    r = sess.get(f"{_API}/drafts", params={"q": f"subject:({subject_token})", "maxResults": 5},
                 timeout=_TIMEOUT)
    _check(r, "tìm draft template")
    drafts = r.json().get("drafts", [])
    if not drafts:
        raise GmailError(
            f"không thấy draft nào có subject chứa '{subject_token}'. Template của Gmail "
            f"API không đọc được — soạn thư từ template rồi LƯU NHÁP, subject giữ "
            f"'{subject_token}'."
        )
    r = sess.get(f"{_API}/drafts/{drafts[0]['id']}", params={"format": "full"}, timeout=_TIMEOUT)
    _check(r, "đọc draft template")
    payload = r.json().get("message", {}).get("payload", {})
    subject = next((h["value"] for h in payload.get("headers", [])
                    if h.get("name", "").lower() == "subject"), "")
    html = _walk_for_html(payload)
    if not html:
        raise GmailError("draft template không có phần HTML (soạn trong Gmail là có sẵn).")
    return {"subject": subject, "html": html}


def send_html(sess: requests.Session, to: list[str], cc: list[str],
              subject: str, html: str) -> str:
    """Gui mail HTML duoi danh nghia nguoi da auth. Tra ve message id."""
    if not to:
        raise GmailError("chưa có người nhận (weekly_mail.to trong settings.json).")
    msg = MIMEMultipart("alternative")
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html", "utf-8"))
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
    r = sess.post(f"{_API}/messages/send", json={"raw": raw}, timeout=_TIMEOUT)
    _check(r, "gửi mail")
    return r.json().get("id", "")


if __name__ == "__main__":
    if "--auth" in sys.argv:
        try:
            auth_flow()
        except GmailError as e:
            print(f"LOI: {e}")
            sys.exit(1)
    else:
        print("Dùng: python skills/gmail_gateway.py --auth  (đăng nhập 1 lần, lưu token)")
