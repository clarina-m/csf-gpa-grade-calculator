(() => {
  const clientId = document.querySelector('meta[name="google-oauth-client-id"]').content.trim();
  const scope = "https://www.googleapis.com/auth/drive.appdata";
  const drive = "https://www.googleapis.com/drive/v3";
  const upload = "https://www.googleapis.com/upload/drive/v3";
  const connect = byId("google-connect");
  const signout = byId("google-signout");
  const retry = byId("google-retry");
  const status = byId("google-status");
  const name = byId("dashboard-name");
  let account;
  let token;
  let fileId;
  let pending;
  let saved;
  let timer;
  let saving;
  let busy = false;
  let dashboardReady = false;

  function render() {
    const studentName = account?.given_name || account?.name;
    name.textContent = studentName ? `${studentName}’s Dashboard` : account ? "Your Dashboard" : "Student Dashboard";
    connect.textContent = account ? "Reconnect Google" : "Sign in with Google";
    connect.hidden = Boolean(account && token);
    connect.disabled = busy;
    signout.hidden = !account;
    signout.disabled = busy;
    retry.textContent = dashboardReady ? "Retry save" : "Retry loading dashboard";
    retry.hidden = !(account && token && (!dashboardReady || pending));
    retry.disabled = busy || Boolean(saving);
    for (const editor of document.querySelectorAll(".editor, .toggle")) editor.inert = busy || Boolean(account && !dashboardReady);
  }

  async function request(url, accessToken, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` }
    });
    if (response.status === 401) {
      if (accessToken === token) token = undefined;
      throw new Error("Google session expired. Reconnect to save your changes.");
    }
    if (response.status === 403 && url.startsWith("https://www.googleapis.com/")) {
      const details = await response.json().catch(() => ({}));
      const reasons = [
        ...(details.error?.errors ?? []),
        ...(details.error?.details ?? [])
      ].map(item => item.reason);
      if (reasons.some(reason => reason === "accessNotConfigured" || reason === "SERVICE_DISABLED")) {
        throw new Error("Google Drive API is disabled. Enable it in the Cloud project that owns this OAuth client.");
      }
      if (reasons.includes("domainPolicy")) {
        throw new Error("Your school’s Google Workspace policy blocks this app from Drive. Ask school IT to allow it.");
      }
      if (reasons.some(reason => reason === "insufficientPermissions" || reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT")) {
        throw new Error("Drive storage permission is missing. Sign out, then sign in and allow app data access.");
      }
      const reason = reasons.find(value => typeof value === "string");
      throw new Error(`Google Drive denied access (403${reason ? `: ${reason}` : ""}). Check the Drive API and your Google Workspace app permissions.`);
    }
    if (!response.ok) {
      const service = url.startsWith(drive) || url.startsWith(upload) ? "Google Drive" : "Google sign-in";
      throw new Error(`${service} request failed (${response.status}).`);
    }
    return response.json();
  }

  async function findDashboard(accessToken) {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      q: "name = 'csf-student-dashboard-v1.json' and trashed = false",
      orderBy: "modifiedTime desc",
      fields: "files(id)",
      pageSize: "1"
    });
    const result = await request(`${drive}/files?${params}`, accessToken);
    return result.files[0]?.id;
  }

  async function loadDashboard() {
    status.textContent = "Signed in with Google. Loading your dashboard…";
    try {
      const id = await findDashboard(token);
      const dashboard = id
        ? await request(`${drive}/files/${encodeURIComponent(id)}?alt=media`, token)
        : emptyDashboard;
      if (!validDashboard(dashboard)) throw new Error("The saved dashboard could not be read.");
      showDashboard(dashboard);
      saved = JSON.stringify(captureDashboard());
      fileId = id;
      dashboardReady = true;
      status.textContent = id ? "Coursework and grades saved!" : "New dashboard. Changes save to your Google account.";
    } catch (error) {
      status.textContent = `Signed in with Google. ${error.message}`;
    }
  }

  async function uploadDashboard(data) {
    fileId ??= await findDashboard(token);
    const metadata = { name: "csf-student-dashboard-v1.json", mimeType: "application/json" };
    if (!fileId) metadata.parents = ["appDataFolder"];
    const boundary = `csf-${crypto.randomUUID()}`;
    const body = [
      `--${boundary}`, "Content-Type: application/json; charset=UTF-8", "", JSON.stringify(metadata),
      `--${boundary}`, "Content-Type: application/json", "", data,
      `--${boundary}--`, ""
    ].join("\r\n");
    const file = await request(`${upload}/files${fileId ? "/" + encodeURIComponent(fileId) : ""}?uploadType=multipart`, token, {
      method: fileId ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body
    });
    fileId = file.id;
  }

  async function flush() {
    clearTimeout(timer);
    if (saving) return saving;
    if (!pending) return true;
    if (!token) return false;

    status.textContent = "Saving to your Google account…";
    saving = (async () => {
      try {
        while (pending) {
          const data = pending;
          await uploadDashboard(data);
          saved = data;
          if (pending === data) pending = undefined;
        }
        status.textContent = "Coursework and grades saved!";
        return true;
      } catch (error) {
        status.textContent = `${error.message} Your changes are still in this tab.`;
        return false;
      }
    })();
    render();
    const complete = await saving;
    saving = undefined;
    render();
    return complete;
  }

  document.addEventListener("dashboard-change", () => {
    if (!account) {
      if (!saveGuestDashboard()) status.textContent = "Browser storage is unavailable. Guest changes are only in this tab.";
      return;
    }
    if (!dashboardReady) return;
    const data = JSON.stringify(captureDashboard());
    pending = (saving || data !== saved) ? data : undefined;
    clearTimeout(timer);
    if (pending) {
      status.textContent = token ? "Changes waiting to save…" : "Reconnect Google to save your changes.";
      if (token) timer = setTimeout(flush, 900);
    } else {
      status.textContent = "Coursework and grades saved!";
    }
    render();
  });

  window.addEventListener("beforeunload", event => {
    if (!pending) return;
    event.preventDefault();
    event.returnValue = "";
  });

  retry.addEventListener("click", async () => {
    if (dashboardReady) {
      await flush();
      return;
    }
    busy = true;
    render();
    await loadDashboard();
    busy = false;
    render();
  });
  signout.addEventListener("click", async () => {
    busy = true;
    render();
    if (await flush()) {
      account = token = fileId = saved = undefined;
      dashboardReady = false;
      showDashboard(guestDashboard);
      status.textContent = "Signed out. Guest changes save in this browser.";
    } else {
      status.textContent = token
        ? "Changes are still in this tab. Retry saving before signing out."
        : "Reconnect Google to save your changes before signing out.";
    }
    busy = false;
    render();
  });

  if (!clientId || location.protocol === "file:") {
    status.textContent = location.protocol === "file:"
      ? "Guest changes save in this browser. Google sign-in requires a configured web address."
      : "Guest changes save in this browser. Google sign-in is awaiting setup.";
    return;
  }

  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.addEventListener("error", () => {
    status.textContent = "Google sign-in could not load. Refresh the page to try again.";
  });
  script.addEventListener("load", () => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: `openid profile ${scope}`,
      include_granted_scopes: false,
      async callback(response) {
        try {
          if (response.error || !google.accounts.oauth2.hasGrantedAllScopes(response, scope)) {
            throw new Error("Google access was not granted.");
          }
          const accessToken = response.access_token;
          const profile = await request("https://openidconnect.googleapis.com/v1/userinfo", accessToken);
          if (!profile.sub) throw new Error("Google did not return an account identifier.");
          if (account && profile.sub !== account.sub) throw new Error("Choose the same Google account to reconnect.");
          if (!account) showDashboard(emptyDashboard);
          account = profile;
          token = accessToken;
          render();
          if (!dashboardReady) await loadDashboard();
          else if (pending) await flush();
          else status.textContent = "Google account reconnected.";
        } catch (error) {
          status.textContent = error.message;
        } finally {
          busy = false;
          render();
        }
      },
      error_callback() {
        busy = false;
        status.textContent = "Google sign-in was interrupted. Try again.";
        render();
      }
    });

    connect.addEventListener("click", () => {
      busy = true;
      render();
      try {
        client.requestAccessToken({ prompt: "select_account" });
      } catch {
        busy = false;
        status.textContent = "Google sign-in could not start. Try again.";
        render();
      }
    });
    render();
  });
  document.head.append(script);
})();
