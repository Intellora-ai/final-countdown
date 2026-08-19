import {compile} from 'svelte/compiler';
const r=compile('<h1>hi</h1>',{generate:'server'});
if(!r.js.code.length) throw new Error('no output');
console.log('ok');
