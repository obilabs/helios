// Imported first in main.tsx so the fetch wrapper is in place before any module
// (including the better-auth client) makes a request.
import { API_BASE_URL } from '../config/api';
import { installCsrfFetch } from './csrf';

installCsrfFetch(API_BASE_URL);
