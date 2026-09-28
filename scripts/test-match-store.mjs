import assert from 'node:assert/strict';
import { matchStore } from './match-store.mjs';

const stores = [
  {
    id:'osm-consum',
    name:'Consum Supermercado San Vicente',
    chain:'Consum',
    town:'San Vicente del Raspeig',
    address:'Calle Alicante, 52, 03690 San Vicente del Raspeig',
    lat:38.3931,lng:-0.5218,
    sourceType:'osm-discovery',hoursVerified:false
  },
  {
    id:'osm-repsol',
    name:'Repsol',
    chain:'Repsol',
    town:'Alicante',
    address:'Avenida X, 12, 03001 Alicante',
    lat:38.345,lng:-0.490,
    sourceType:'osm-discovery',hoursVerified:false
  }
];

assert.equal(
  matchStore(stores,{
    name:'Consum Supermercado San Vicente',
    chain:'Consum',
    town:'San Vicente del Raspeig',
    address:'C/ Alicante 52, 03690 San Vicente del Raspeig',
    lat:38.3931,lng:-0.5217
  })?.id,
  'osm-consum'
);

assert.equal(
  matchStore(stores,{
    name:'Repsol',
    chain:'Repsol',
    town:'Alicante',
    address:'Avenida X 12, 03001 Alicante',
    lat:38.345,lng:-0.490
  })?.id,
  'osm-repsol'
);

assert.equal(
  matchStore(stores,{
    name:'Repsol',
    chain:'Repsol',
    town:'Alicante',
    address:'Avenida Y 99, 03010 Alicante',
    lat:38.370,lng:-0.510
  }),
  null
);

console.log('match-store tests passed');
