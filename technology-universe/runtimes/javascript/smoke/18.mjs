import {h} from 'preact';
const v=h('div',{class:'c'},'t');
if(v.type!=='div'||v.props.class!=='c') throw new Error('bad vnode');
console.log('ok');
