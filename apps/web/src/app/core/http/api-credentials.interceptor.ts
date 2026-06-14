import { HttpInterceptorFn } from '@angular/common/http';

import { environment } from '../../../environments/environment';

export const apiCredentialsInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isApiRequest(request.url)) {
    return next(request);
  }

  return next(
    request.clone({
      withCredentials: true,
    }),
  );
};

function isApiRequest(url: string): boolean {
  const currentOrigin = globalThis.location?.origin ?? 'https://localhost';
  const apiBaseUrl = parseUrl(environment.apiBaseUrl, currentOrigin);
  const requestUrl = parseUrl(url, currentOrigin);

  if (apiBaseUrl === null || requestUrl === null) {
    return false;
  }

  if (requestUrl.origin !== apiBaseUrl.origin) {
    return false;
  }

  return pathMatchesApiBase(requestUrl.pathname, apiBaseUrl.pathname);
}

function parseUrl(url: string, base: string): URL | null {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

function pathMatchesApiBase(pathname: string, apiBasePathname: string): boolean {
  const path = withoutTrailingSlash(pathname);
  const apiBasePath = withoutTrailingSlash(apiBasePathname);

  return apiBasePath === '' || path === apiBasePath || path.startsWith(`${apiBasePath}/`);
}

function withoutTrailingSlash(value: string): string {
  let end = value.length;

  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}
