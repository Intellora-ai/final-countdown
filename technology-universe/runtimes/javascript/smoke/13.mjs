import {createSSRApp,h} from 'vue';
import {renderToString} from 'vue/server-renderer';
const app=createSSRApp({render(){return h('h1','hi')}});
const s=await renderToString(app);
if(!s.includes('hi')) throw new Error(s);
console.log('ok',s);
