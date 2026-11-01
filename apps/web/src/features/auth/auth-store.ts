import { useSyncExternalStore } from 'react';
import type { VaiTro } from './roles';

export type AuthStatus =
  'checking' | 'authenticated' | 'unauthenticated' | 'error';

export interface AuthUser {
  vaiTro: VaiTro;
  hoTen: string;
  daXacMinhEmail: boolean;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  // Phiên vừa kết thúc ngoài ý muốn: màn đăng nhập hiện "Phiên đăng nhập đã kết thúc"
  sessionEnded: boolean;
  error: unknown;
  canRetry: boolean;
}

const INITIAL_STATE: AuthState = {
  status: 'checking',
  user: null,
  sessionEnded: false,
  error: null,
  canRetry: false,
};

let state = INITIAL_STATE;
// Access token CHỈ nằm ở biến này (Q2): không storage, không cookie, và không ở `state` nên component không đọc được
let accessToken: string | null = null;
const listeners = new Set<() => void>();

export function getAuthState(): AuthState {
  return state;
}

export function setAuthState(next: Partial<AuthState>): void {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState);
}

export function resetAuthStore(): void {
  state = INITIAL_STATE;
  accessToken = null;
}
