import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { apiCredentialsInterceptor } from './api-credentials.interceptor';

describe('apiCredentialsInterceptor', () => {
  let httpClient: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiCredentialsInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('includes browser credentials on API requests so session cookies reach the Worker', () => {
    httpClient.get('/api/auth/me').subscribe();

    const request = http.expectOne('/api/auth/me');
    expect(request.request.withCredentials).toBeTrue();
    request.flush({ user: null });
  });

  it('includes browser credentials on API root requests with query parameters', () => {
    httpClient.get('/api?status=1').subscribe();

    const request = http.expectOne('/api?status=1');
    expect(request.request.withCredentials).toBeTrue();
    request.flush({});
  });

  it('includes browser credentials on absolute same-origin API URLs', () => {
    const apiUrl = new URL('/api/auth/me', globalThis.location.origin).toString();

    httpClient.get(apiUrl).subscribe();

    const request = http.expectOne(apiUrl);
    expect(request.request.withCredentials).toBeTrue();
    request.flush({ user: null });
  });

  it('leaves non-API requests unchanged', () => {
    httpClient.get('/assets/config.json').subscribe();

    const request = http.expectOne('/assets/config.json');
    expect(request.request.withCredentials).toBeFalse();
    request.flush({});
  });

  it('leaves cross-origin API-like requests unchanged', () => {
    const externalApiUrl = 'https://example.invalid/api/auth/me';

    httpClient.get(externalApiUrl).subscribe();

    const request = http.expectOne(externalApiUrl);
    expect(request.request.withCredentials).toBeFalse();
    request.flush({});
  });

  it('does not treat similarly prefixed non-API paths as API requests', () => {
    httpClient.get('/apiary/config.json').subscribe();

    const request = http.expectOne('/apiary/config.json');
    expect(request.request.withCredentials).toBeFalse();
    request.flush({});
  });
});
