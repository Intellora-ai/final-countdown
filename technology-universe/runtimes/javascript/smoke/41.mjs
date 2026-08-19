import {createStore} from 'zustand/vanilla';
const s=createStore(()=>({n:1}));
s.setState({n:42});
if(s.getState().n!==42) throw new Error('bad state');
console.log('ok');
