import { useEffect, useState } from 'react';
import { fetchAccessConfig, saveAccessConfig } from '../lib/accessConfig';

/** Admin-only: manage who may sign in (allowlist of emails and/or domains). */
export default function Settings() {
  const [emails, setEmails] = useState('');
  const [domains, setDomains] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccessConfig()
      .then((c) => {
        setEmails(c.emails.join('\n'));
        setDomains(c.domains.join('\n'));
      })
      .finally(() => setLoading(false));
  }, []);

  function parseLines(text: string): string[] {
    return [...new Set(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveAccessConfig({ emails: parseLines(emails), domains: parseLines(domains) });
      setSavedAt(new Date().toLocaleTimeString('vi-VN'));
    } catch (err) {
      console.error('Lưu cấu hình truy cập thất bại', err);
      setError('Lưu thất bại (cần quyền admin).');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="center-screen" style={{ minHeight: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  const empty = parseLines(emails).length === 0 && parseLines(domains).length === 0;

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Cấu hình</h1>
        <p>Kiểm soát ai được đăng nhập vào web.</p>
      </div>

      <div className="glass section" style={{ padding: '1.5rem', maxWidth: 720 }}>
        <h3>Danh sách cho phép đăng nhập</h3>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Thêm <strong>email cụ thể</strong> hoặc <strong>tên miền</strong> (mỗi dòng một mục).
          Chỉ những tài khoản Google khớp mới vào được. Người khác đăng nhập sẽ bị từ chối.
        </p>

        {empty && (
          <div className="callout-inline" style={{ marginBottom: '1rem' }}>
            ⚠️ Đang để trống → <strong>mọi tài khoản Google</strong> đều đăng nhập được. Thêm ít nhất
            một domain (ví dụ <code>easygoing.vn</code>) để khoá lại.
          </div>
        )}

        <div className="grid-2">
          <label className="field">
            <span>Domain cho phép (mỗi dòng 1)</span>
            <textarea
              className="textarea"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder={'easygoing.vn'}
              style={{ minHeight: 140, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
            />
          </label>
          <label className="field">
            <span>Email cụ thể (mỗi dòng 1)</span>
            <textarea
              className="textarea"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder={'nguoi.a@gmail.com\nnguoi.b@outlook.com'}
              style={{ minHeight: 140, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
            />
          </label>
        </div>

        <div className="row" style={{ gap: '0.75rem' }}>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
          </button>
          {savedAt && <span className="muted" style={{ fontSize: '0.82rem' }}>Đã lưu lúc {savedAt}</span>}
          {error && <span className="error-text" style={{ margin: 0 }}>{error}</span>}
        </div>
      </div>
    </div>
  );
}
