import {atom,createStore} from 'jotai/vanilla';
const a=atom(1); const s=createStore();
s.set(a,42);
if(s.get(a)!==42) throw new Error('bad');
console.log('ok');
