// Open a Discord thread in the desktop app if it's running, else fall back to web.

export function discordThreadLinks(guildId: string, threadId: string) {
  return {
    web: `https://discord.com/channels/${guildId}/${threadId}`,
    app: `discord://-/channels/${guildId}/${threadId}`,
  };
}

/**
 * Trigger the `discord://` protocol (opens the desktop app). If the app grabs
 * focus the window blurs and we stop; otherwise, after a short wait, open the
 * web client in a new tab. Best-effort — the browser can't truly detect the app.
 */
export function openDiscordThread(guildId: string, threadId: string): void {
  const { web, app } = discordThreadLinks(guildId, threadId);
  let handedOff = false;
  const onBlur = () => { handedOff = true; };
  window.addEventListener('blur', onBlur, { once: true });

  const a = document.createElement('a');
  a.href = app;
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.setTimeout(() => {
    window.removeEventListener('blur', onBlur);
    if (!handedOff && !document.hidden) window.open(web, '_blank', 'noopener');
  }, 1000);
}
