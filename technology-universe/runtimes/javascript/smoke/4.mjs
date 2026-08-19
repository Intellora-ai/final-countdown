import {normalizePath, version} from 'vite';
const p = normalizePath('/a//b/../b');
if (typeof p !== 'string' || p.includes('..')) throw new Error('normalizePath -> ' + p);
if (!version) throw new Error('no version export');
console.log('ok', version, p);
