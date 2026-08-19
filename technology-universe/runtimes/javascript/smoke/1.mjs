import {createElement} from 'react';
const el=createElement('h1',{id:'a'},'hi');
if(el.type!=='h1'||el.props.id!=='a') throw new Error('bad vnode');
console.log('ok');
