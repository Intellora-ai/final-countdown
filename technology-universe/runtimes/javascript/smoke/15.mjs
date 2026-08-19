import {createRoot,createSignal} from 'solid-js';
let v;
createRoot(()=>{const [g,s]=createSignal(1); s(41); v=g()+1;});
if(v!==42) throw new Error('got '+v);
console.log('ok');
