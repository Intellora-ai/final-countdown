import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const s=renderToStaticMarkup(createElement('h1',null,'hi'));
if(s!=='<h1>hi</h1>') throw new Error('got '+s);
console.log('ok');
