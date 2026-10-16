function cookieValue(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const part = document.cookie.split('; ').find((value) => value.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : '';
}

export async function apiRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const upperMethod = method.toUpperCase();
  const requestHeaders = { Accept: 'application/json', ...headers };
  const options = { method: upperMethod, credentials: 'same-origin', headers: requestHeaders };
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(upperMethod)) {
    const csrfToken = cookieValue('csrftoken');
    if (csrfToken) requestHeaders['X-CSRFToken'] = csrfToken;
  }

  const response = await fetch(path, options);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}
