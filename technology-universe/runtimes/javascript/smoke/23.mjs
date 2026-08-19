import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
const r=await postcss([autoprefixer({overrideBrowserslist:['ie 11']})]).process('a{user-select:none}',{from:undefined});
if(!r.css.includes('-ms-user-select')) throw new Error(r.css);
console.log('ok');
