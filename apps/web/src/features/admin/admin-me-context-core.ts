import { createContext } from 'react';
import type { AdminMe } from './admin-me';

export const AdminMeContext = createContext<AdminMe | null>(null);
