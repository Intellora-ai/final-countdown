import {html} from 'lit';
const t=html`<p>${'x'}</p>`;
if(!t.strings||t.values[0]!=='x') throw new Error('bad template');
console.log('ok');
