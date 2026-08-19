import * as turf from '@turf/turf';
const d = turf.distance(turf.point([0,0]), turf.point([0,1]), {units:'kilometers'});
console.log('TURF ok distance_km=', d.toFixed(3));

const zip = await import('@zip.js/zip.js');
const w = new zip.ZipWriter(new zip.Uint8ArrayWriter());
await w.add('a.txt', new zip.TextReader('hello registry'));
const bytes = await w.close();
console.log('ZIPJS ok bytes=', bytes.length);

import puppeteer from 'puppeteer';
const b = await puppeteer.launch({headless:true});
const p = await b.newPage();
await p.setContent('<title>Registry Smoke</title><h1>ok</h1>');
console.log('PUPPETEER ok title=', await p.title(), 'browser=', await b.version());
await b.close();
