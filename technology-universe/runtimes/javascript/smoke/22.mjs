import postcss from 'postcss';
const r=await postcss([]).process('a{color:red}',{from:undefined});
if(!r.css.includes('red')) throw new Error(r.css);
console.log('ok');
