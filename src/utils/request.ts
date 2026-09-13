const getBaseUrl = () => {
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || 
                 hostname === '127.0.0.1' || 
                 hostname.startsWith('192.') || 
                 hostname.startsWith('0.0.');
  
  return {
    url: '/api',
    isLocal
  };
};

const urlConfig = getBaseUrl();
const BASE_URL = urlConfig.url;
export const isLocalDev = urlConfig.isLocal;

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as any) };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    let errorMessage = errorData.detail || errorData.message || errorData.error;
    
    if (Array.isArray(errorMessage)) {
      errorMessage = errorMessage.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
    }

    const errorMap: Record<string, string> = {
      'Username already exists': '用户名已存在',
      'Invalid verification code': '验证码错误'
    };

    if (typeof errorMessage === 'string' && errorMap[errorMessage]) {
      errorMessage = errorMap[errorMessage];
    }
    
    throw new Error(errorMessage || `请求失败 (${response.status})`);
  }

  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: any) => request<T>(path, { 
    method: 'POST', 
    body: body ? JSON.stringify(body) : undefined 
  }),
  put: <T>(path: string, body?: any) => request<T>(path, { 
    method: 'PUT', 
    body: body ? JSON.stringify(body) : undefined 
  }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
