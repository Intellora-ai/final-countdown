import {icons} from 'lucide';
const n=Object.keys(icons).length;
if(n<100) throw new Error('only '+n);
console.log('ok',n);
